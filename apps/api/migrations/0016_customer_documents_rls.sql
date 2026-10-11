-- Customer documents M2: company isolation, integrity guards and runtime privileges.
-- Additive only: no existing table or row is changed (docs/M2_MUSTERI_BELGELERI_PLANI.md §2, §3, §6).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_documents', 'customer_files', 'customer_document_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- A document stays with its company, customer and type; a voided period is final; a renewal keeps its link.
CREATE OR REPLACE FUNCTION customer_documents_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.customer_id <> OLD.customer_id OR NEW.type <> OLD.type
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.renews_id IS DISTINCT FROM OLD.renews_id THEN
    RAISE EXCEPTION 'customer document identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_immutable';
  END IF;
  IF OLD.record_state = 'voided' THEN
    RAISE EXCEPTION 'a voided customer document cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_voided_final';
  END IF;
  IF OLD.locked_at IS NOT NULL AND (NEW.number_ciphertext IS DISTINCT FROM OLD.number_ciphertext OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
     OR NEW.valid_until IS DISTINCT FROM OLD.valid_until OR NEW.issuing_country IS DISTINCT FROM OLD.issuing_country) THEN
    RAISE EXCEPTION 'a locked customer document is renewed, not corrected' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_locked';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_documents_guard BEFORE UPDATE ON customer_documents FOR EACH ROW EXECUTE FUNCTION customer_documents_guard();
--> statement-breakpoint

-- One document number (per-company HMAC) belongs to one customer of the company while active. The same customer may
-- hold it in several periods (a renewal often keeps the number). Serialised per number so two saves cannot race.
CREATE OR REPLACE FUNCTION customer_documents_number_owner() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number_lookup IS NULL OR NEW.record_state <> 'active' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('customer-document-number:' || NEW.company_id::text || ':' || NEW.number_lookup, 0));
  IF EXISTS (SELECT 1 FROM customer_documents d
             WHERE d.company_id = NEW.company_id AND d.number_lookup = NEW.number_lookup AND d.record_state = 'active'
               AND d.customer_id <> NEW.customer_id AND d.id <> NEW.id) THEN
    RAISE EXCEPTION 'document number already recorded for another customer of this company' USING ERRCODE = 'unique_violation', CONSTRAINT = 'customer_documents_number_owner';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_documents_number_owner BEFORE INSERT OR UPDATE OF number_lookup, record_state ON customer_documents FOR EACH ROW EXECUTE FUNCTION customer_documents_number_owner();
--> statement-breakpoint

-- Renewal links stay within the same customer and type.
CREATE OR REPLACE FUNCTION customer_documents_renewal_link() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.renews_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM customer_documents d WHERE d.company_id = NEW.company_id AND d.id = NEW.renews_id AND d.customer_id = NEW.customer_id AND d.type = NEW.type) THEN
    RAISE EXCEPTION 'a renewal must follow a document of the same customer and type' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_renewal_link';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_documents_renewal_link BEFORE INSERT ON customer_documents FOR EACH ROW EXECUTE FUNCTION customer_documents_renewal_link();
--> statement-breakpoint

-- Runtime privileges. Documents are voided, never deleted; files and file versions are append-only;
-- the sensitive-action log is append-only and holds no company data.
GRANT SELECT, INSERT, UPDATE ON customer_documents TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON customer_files, customer_document_files, user_sensitive_actions TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION customer_documents_guard(), customer_documents_number_owner(), customer_documents_renewal_link() TO acarvo_app;
