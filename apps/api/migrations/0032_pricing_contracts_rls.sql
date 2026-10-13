-- Pricing and contracts V1: company isolation, immutable price-list revisions and quotes, template and contract
-- lifecycles, runtime privileges (docs/FIYATLANDIRMA_SOZLESME_PLANI.md). Additive: no existing table or row changes.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_lists', 'price_list_revisions', 'price_list_rates', 'price_list_seasons', 'price_list_extras', 'price_list_discounts',
                           'price_quotes', 'contract_templates', 'contract_template_versions', 'contracts', 'contract_files', 'contract_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Price lists: identity and currency stay; draft -> active -> archived (draft -> archived too), archived is final; the
-- current revision only moves forward to an existing revision; a list is activated only with at least one rate.
CREATE OR REPLACE FUNCTION price_lists_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.current_revision <> 1 THEN
      RAISE EXCEPTION 'a price list starts as a draft at revision 1' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_lifecycle';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.currency <> OLD.currency OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'price list identity and currency cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_immutable';
  END IF;
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'an archived price list cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_final';
  END IF;
  IF NOT (NEW.status = OLD.status OR (OLD.status = 'draft' AND NEW.status IN ('active', 'archived')) OR (OLD.status = 'active' AND NEW.status = 'archived')) THEN
    RAISE EXCEPTION 'price list status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_lifecycle';
  END IF;
  IF NEW.current_revision < OLD.current_revision OR NOT EXISTS (
    SELECT 1 FROM price_list_revisions r WHERE r.company_id = NEW.company_id AND r.price_list_id = NEW.id AND r.revision = NEW.current_revision
  ) THEN
    RAISE EXCEPTION 'the current revision moves forward to an existing revision' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_revision';
  END IF;
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM price_list_rates x WHERE x.company_id = NEW.company_id AND x.price_list_id = NEW.id AND x.revision = NEW.current_revision
  ) THEN
    RAISE EXCEPTION 'an active price list needs at least one vehicle class rate' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_rates_required';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER price_lists_guard BEFORE INSERT OR UPDATE ON price_lists FOR EACH ROW EXECUTE FUNCTION price_lists_guard();
--> statement-breakpoint

-- A revision is the next one of its list (or revision 1 of a new list); its rates, seasons, extras and discounts are
-- written in the same transaction as the revision row and never afterwards (rows are never updated or deleted).
CREATE OR REPLACE FUNCTION price_list_revisions_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE cur integer;
DECLARE latest integer;
BEGIN
  SELECT current_revision INTO cur FROM price_lists WHERE company_id = NEW.company_id AND id = NEW.price_list_id FOR UPDATE;
  SELECT max(revision) INTO latest FROM price_list_revisions WHERE company_id = NEW.company_id AND price_list_id = NEW.price_list_id;
  IF NOT ((latest IS NULL AND NEW.revision = 1) OR (latest IS NOT NULL AND NEW.revision = latest + 1 AND latest = cur)) THEN
    RAISE EXCEPTION 'a price list revision follows the current one' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_list_revisions_sequence';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER price_list_revisions_guard BEFORE INSERT ON price_list_revisions FOR EACH ROW EXECUTE FUNCTION price_list_revisions_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION price_list_parts_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM price_list_revisions r
    WHERE r.company_id = NEW.company_id AND r.price_list_id = NEW.price_list_id AND r.revision = NEW.revision AND r.created_at = now()
  ) THEN
    RAISE EXCEPTION 'price list parts are written with their revision' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_list_parts_sealed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER price_list_rates_guard BEFORE INSERT ON price_list_rates FOR EACH ROW EXECUTE FUNCTION price_list_parts_guard();
--> statement-breakpoint
CREATE TRIGGER price_list_seasons_guard BEFORE INSERT ON price_list_seasons FOR EACH ROW EXECUTE FUNCTION price_list_parts_guard();
--> statement-breakpoint
CREATE TRIGGER price_list_extras_guard BEFORE INSERT ON price_list_extras FOR EACH ROW EXECUTE FUNCTION price_list_parts_guard();
--> statement-breakpoint
CREATE TRIGGER price_list_discounts_guard BEFORE INSERT ON price_list_discounts FOR EACH ROW EXECUTE FUNCTION price_list_parts_guard();
--> statement-breakpoint

-- Quotes (spec §67: a preview, never a charge): created against the current revision of an active list, for the
-- target's own planned period, in the list's currency; afterwards only "quoted -> superseded" once, nothing else.
CREATE OR REPLACE FUNCTION price_quotes_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE pl record;
DECLARE t record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'quoted' OR NEW.status <> 'superseded'
       OR (to_jsonb(NEW) - ARRAY['status', 'superseded_at', 'superseded_by_id']) <> (to_jsonb(OLD) - ARRAY['status', 'superseded_at', 'superseded_by_id']) THEN
      RAISE EXCEPTION 'a quote never changes; it can only be superseded once' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_quotes_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'quoted' THEN
    RAISE EXCEPTION 'a quote starts as quoted' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_quotes_immutable';
  END IF;
  SELECT status, current_revision, currency INTO pl FROM price_lists WHERE company_id = NEW.company_id AND id = NEW.price_list_id;
  IF pl.status <> 'active' OR pl.current_revision <> NEW.price_list_revision OR pl.currency <> NEW.currency THEN
    RAISE EXCEPTION 'a quote uses the current revision of an active price list in its currency' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_quotes_price_list';
  END IF;
  IF NEW.reservation_id IS NOT NULL THEN
    SELECT status, pickup_at AS p, return_at AS r, vehicle_class_id AS c INTO t FROM reservations WHERE company_id = NEW.company_id AND id = NEW.reservation_id;
    IF t.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'only open reservations are quoted' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_quotes_target';
    END IF;
  ELSE
    SELECT status, planned_pickup_at AS p, planned_return_at AS r, vehicle_class_id AS c INTO t FROM rentals WHERE company_id = NEW.company_id AND id = NEW.rental_id;
    IF t.status NOT IN ('prepared', 'delivered') THEN
      RAISE EXCEPTION 'only prepared or active rentals are quoted' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_quotes_target';
    END IF;
  END IF;
  IF t.p <> NEW.pickup_at OR t.r <> NEW.return_at OR t.c <> NEW.vehicle_class_id THEN
    RAISE EXCEPTION 'a quote is for the planned period and class of its reservation or rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'price_quotes_target';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER price_quotes_guard BEFORE INSERT OR UPDATE ON price_quotes FOR EACH ROW EXECUTE FUNCTION price_quotes_guard();
--> statement-breakpoint

-- Template versions: the body changes only while a draft; draft -> active -> retired; activation needs the required
-- placeholders (spec §85.3) and nothing unknown is checked by the API; only one active and one draft per template.
CREATE OR REPLACE FUNCTION contract_template_versions_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE f text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'a template version starts as a draft' USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_template_versions_lifecycle';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.template_id <> OLD.template_id OR NEW.version_no <> OLD.version_no
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'template version identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_template_versions_immutable';
  END IF;
  IF OLD.status <> 'draft' AND NEW.body <> OLD.body THEN
    RAISE EXCEPTION 'an active or retired template version cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_template_versions_immutable';
  END IF;
  IF NOT (NEW.status = OLD.status OR (OLD.status = 'draft' AND NEW.status = 'active') OR (OLD.status = 'active' AND NEW.status = 'retired')) THEN
    RAISE EXCEPTION 'template version status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_template_versions_lifecycle';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'active' THEN
    FOREACH f IN ARRAY ARRAY['contract\.no', 'renter\.name', 'vehicle\.plate', 'period\.pickup', 'period\.return', 'price\.table'] LOOP
      IF NEW.body !~ ('\{\{\s*' || f || '\s*\}\}') THEN
        RAISE EXCEPTION 'an active template contains every required field' USING ERRCODE = 'check_violation', CONSTRAINT = 'contract_template_versions_required';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contract_template_versions_guard BEFORE INSERT OR UPDATE ON contract_template_versions FOR EACH ROW EXECUTE FUNCTION contract_template_versions_guard();
--> statement-breakpoint

-- Contracts: made from an active template version for a prepared or active rental; content, parties and sources never
-- change; draft -> under review -> externally processed; any open one -> archived or superseded; those two are final.
-- There is no signed state: ACARVO has no e-signature (F7).
CREATE OR REPLACE FUNCTION contracts_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE k record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.external_ack_at IS NOT NULL THEN
      RAISE EXCEPTION 'a contract starts as a draft' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_lifecycle';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contract_template_versions v WHERE v.company_id = NEW.company_id AND v.id = NEW.template_version_id AND v.status = 'active') THEN
      RAISE EXCEPTION 'a contract is made from an active template version' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_template_active';
    END IF;
    SELECT status, reservation_id INTO k FROM rentals WHERE company_id = NEW.company_id AND id = NEW.rental_id;
    IF k.status NOT IN ('prepared', 'delivered') THEN
      RAISE EXCEPTION 'contracts are drafted for prepared or active rentals' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_rental_status';
    END IF;
    IF NEW.reservation_id IS DISTINCT FROM k.reservation_id THEN
      RAISE EXCEPTION 'the reservation is the rental''s own' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_sources';
    END IF;
    IF NEW.quote_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM price_quotes q WHERE q.company_id = NEW.company_id AND q.id = NEW.quote_id
        AND (q.rental_id = NEW.rental_id OR (k.reservation_id IS NOT NULL AND q.reservation_id = k.reservation_id))
    ) THEN
      RAISE EXCEPTION 'the quote belongs to the rental or its reservation' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_sources';
    END IF;
    IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM contracts c WHERE c.company_id = NEW.company_id AND c.id = NEW.supersedes_id AND c.rental_id = NEW.rental_id AND c.contract_no = NEW.contract_no AND c.revision = NEW.revision - 1
    ) THEN
      RAISE EXCEPTION 'a new revision follows the previous revision of the same contract' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_sources';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.contract_no <> OLD.contract_no OR NEW.revision <> OLD.revision OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
     OR NEW.rental_id <> OLD.rental_id OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id OR NEW.quote_id IS DISTINCT FROM OLD.quote_id
     OR NEW.template_version_id <> OLD.template_version_id OR NEW.content <> OLD.content OR NEW.client_request_id <> OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'contract content and sources cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_immutable';
  END IF;
  IF OLD.status IN ('archived', 'superseded') THEN
    RAISE EXCEPTION 'a % contract cannot change', OLD.status USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_final';
  END IF;
  IF OLD.external_ack_at IS NOT NULL AND (NEW.external_ack_at IS DISTINCT FROM OLD.external_ack_at OR NEW.external_ack_by IS DISTINCT FROM OLD.external_ack_by
       OR NEW.external_reference IS DISTINCT FROM OLD.external_reference) THEN
    RAISE EXCEPTION 'an external statement cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_immutable';
  END IF;
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'draft' AND NEW.status IN ('under_review', 'archived', 'superseded'))
          OR (OLD.status = 'under_review' AND NEW.status IN ('externally_processed', 'archived', 'superseded'))
          OR (OLD.status = 'externally_processed' AND NEW.status IN ('archived', 'superseded'))) THEN
    RAISE EXCEPTION 'contract status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'contracts_lifecycle';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER contracts_guard BEFORE INSERT OR UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION contracts_guard();
--> statement-breakpoint

-- Runtime privileges: nothing is deleted; revisions, their parts, templates, files and events are append-only.
GRANT SELECT, INSERT, UPDATE ON price_lists, price_quotes, contract_template_versions, contracts TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON price_list_revisions, price_list_rates, price_list_seasons, price_list_extras, price_list_discounts, contract_templates, contract_files, contract_events TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION price_lists_guard(), price_list_revisions_guard(), price_list_parts_guard(), price_quotes_guard(), contract_template_versions_guard(), contracts_guard() TO acarvo_app;
