-- Rentals V1 integration (product decisions K1, K3): company rental operating mode and handover gates in the database.
-- Additive: one new table with forced RLS; the rental and inspection guards of 0028 are replaced by stricter versions
-- (0028 itself is not edited). No existing row is changed; a company without a settings row has the mode off.

ALTER TABLE company_rental_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE company_rental_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY company_rental_settings_select ON company_rental_settings FOR SELECT USING (company_id = app_company_id());
--> statement-breakpoint
CREATE POLICY company_rental_settings_insert ON company_rental_settings FOR INSERT WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
CREATE POLICY company_rental_settings_update ON company_rental_settings FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
CREATE POLICY company_rental_settings_delete ON company_rental_settings FOR DELETE USING (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE company_rental_settings ADD CONSTRAINT company_rental_settings_version_check CHECK (version >= 1);
--> statement-breakpoint

-- Lifecycle and identity as in 0028. Handing over additionally needs, in the same row change:
--  * the pickup branch's country (K3: the document rule depends on it; never guessed),
--  * the company's external contract/pricing mode switched on, with both staff statements and the external reference
--    (K1: ACARVO has no contract or pricing module, so without that mode no handover can be completed),
--  * a primary driver, and for every active driver a latest document decision "eligible" taken after the last plan change.
CREATE OR REPLACE FUNCTION rentals_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE plan_changed timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'prepared' THEN
      RAISE EXCEPTION 'a rental starts as prepared' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_lifecycle';
    END IF;
    IF NEW.reservation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM reservations r WHERE r.company_id = NEW.company_id AND r.id = NEW.reservation_id AND r.status = 'converted'
    ) THEN
      RAISE EXCEPTION 'the reservation must be converted in the same transaction' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_reservation_converted';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.rental_no <> OLD.rental_no OR NEW.origin <> OLD.origin
     OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'rental identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_immutable';
  END IF;
  IF OLD.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'a % rental cannot change', OLD.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_final';
  END IF;
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'prepared' AND NEW.status IN ('delivered', 'cancelled'))
          OR (OLD.status = 'delivered' AND NEW.status = 'returned')
          OR (OLD.status = 'returned' AND NEW.status = 'closed')) THEN
    RAISE EXCEPTION 'rental status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_lifecycle';
  END IF;
  IF OLD.status = 'prepared' AND NEW.status = 'prepared' AND (
       NEW.external_terms_ack_at IS NOT NULL OR NEW.external_pricing_ack_at IS NOT NULL OR NEW.external_reference IS NOT NULL) THEN
    RAISE EXCEPTION 'handover statements are recorded with the handover itself' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_external_terms_statement';
  END IF;
  IF OLD.status IN ('delivered', 'returned') AND (
       NEW.customer_id <> OLD.customer_id OR NEW.corporate_account_id IS DISTINCT FROM OLD.corporate_account_id
       OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.vehicle_class_id <> OLD.vehicle_class_id
       OR NEW.pickup_branch_id <> OLD.pickup_branch_id OR NEW.planned_pickup_at <> OLD.planned_pickup_at OR NEW.pickup_timezone <> OLD.pickup_timezone
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at OR NEW.delivered_by IS DISTINCT FROM OLD.delivered_by
       OR NEW.external_terms_ack_at IS DISTINCT FROM OLD.external_terms_ack_at OR NEW.external_terms_ack_by IS DISTINCT FROM OLD.external_terms_ack_by
       OR NEW.external_pricing_ack_at IS DISTINCT FROM OLD.external_pricing_ack_at OR NEW.external_pricing_ack_by IS DISTINCT FROM OLD.external_pricing_ack_by
       OR NEW.external_reference IS DISTINCT FROM OLD.external_reference) THEN
    RAISE EXCEPTION 'a handed-over rental keeps its vehicle, customer and handover facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_delivered_immutable';
  END IF;
  IF OLD.status = 'returned' AND (
       NEW.planned_return_at <> OLD.planned_return_at OR NEW.return_branch_id <> OLD.return_branch_id OR NEW.return_timezone <> OLD.return_timezone
       OR NEW.returned_at IS DISTINCT FROM OLD.returned_at OR NEW.returned_by IS DISTINCT FROM OLD.returned_by
       OR NEW.actual_return_branch_id IS DISTINCT FROM OLD.actual_return_branch_id OR NEW.actual_return_timezone IS DISTINCT FROM OLD.actual_return_timezone) THEN
    RAISE EXCEPTION 'a returned rental keeps its return facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_returned_immutable';
  END IF;
  IF OLD.status = 'prepared' AND NEW.status = 'delivered' THEN
    IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.company_id = NEW.company_id AND b.id = NEW.pickup_branch_id AND b.country IS NOT NULL) THEN
      RAISE EXCEPTION 'the pickup branch has no country' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_branch_country';
    END IF;
    IF NOT coalesce((SELECT s.external_terms_mode FROM company_rental_settings s WHERE s.company_id = NEW.company_id), false) THEN
      RAISE EXCEPTION 'no contract and pricing module: handover needs the company external terms mode' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_external_terms_mode';
    END IF;
    IF NEW.external_terms_ack_at IS NULL OR NEW.external_terms_ack_by IS NULL OR NEW.external_pricing_ack_at IS NULL
       OR NEW.external_pricing_ack_by IS NULL OR NEW.external_reference IS NULL THEN
      RAISE EXCEPTION 'handover needs both external statements and the external reference' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_external_terms_statement';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rental_drivers d WHERE d.company_id = NEW.company_id AND d.rental_id = NEW.id AND d.is_primary AND d.removed_at IS NULL) THEN
      RAISE EXCEPTION 'handover needs a primary driver' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_document_decision';
    END IF;
    SELECT max(e.at) INTO plan_changed FROM rental_events e
      WHERE e.company_id = NEW.company_id AND e.rental_id = NEW.id AND e.kind = 'updated' AND coalesce((e.data ->> 'planChanged')::boolean, false);
    IF EXISTS (
      SELECT 1 FROM rental_drivers d
      WHERE d.company_id = NEW.company_id AND d.rental_id = NEW.id AND d.removed_at IS NULL
        AND coalesce((SELECT dc.decision FROM rental_document_checks dc
                      WHERE dc.company_id = d.company_id AND dc.rental_id = d.rental_id AND dc.customer_id = d.customer_id
                        AND dc.checked_at >= coalesce(plan_changed, '-infinity'::timestamptz)
                      ORDER BY dc.checked_at DESC, dc.id DESC LIMIT 1), 'missing') <> 'eligible'
    ) THEN
      RAISE EXCEPTION 'every driver needs a current eligible document decision' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_document_decision';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.rental_id = NEW.id AND i.kind = 'handover' AND i.state = 'final' AND i.vehicle_id = NEW.vehicle_id
    ) THEN
      RAISE EXCEPTION 'a rental is handed over with a final handover inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_handover_evidence';
    END IF;
  END IF;
  IF OLD.status = 'delivered' AND NEW.status = 'returned' AND NOT EXISTS (
    SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.rental_id = NEW.id AND i.kind = 'return'
      AND i.odometer_reading_id IS NOT NULL AND i.location_event_id IS NOT NULL AND i.km IS NOT NULL AND i.fuel IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a rental is returned with its return reading' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_return_evidence';
  END IF;
  IF OLD.status = 'returned' AND NEW.status = 'closed' AND NOT EXISTS (
    SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.rental_id = NEW.id AND i.kind = 'return' AND i.state = 'final'
  ) THEN
    RAISE EXCEPTION 'a rental is closed with a final return inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_close_evidence';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- As in 0028; a final inspection is also complete: cleanliness, condition and every checklist item answered with an
-- allowed value (nothing counts as "ok" by default); a handover also has km, fuel and the receiving driver.
CREATE OR REPLACE FUNCTION rental_inspections_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE k record;
DECLARE n integer;
BEGIN
  SELECT status, vehicle_id INTO k FROM rentals WHERE company_id = NEW.company_id AND id = NEW.rental_id;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.rental_id <> OLD.rental_id OR NEW.kind <> OLD.kind
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'inspection identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_immutable';
    END IF;
    IF OLD.state = 'final' THEN
      RAISE EXCEPTION 'a final inspection cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_final';
    END IF;
  END IF;
  IF (NEW.kind = 'handover' AND k.status <> 'prepared') OR (NEW.kind = 'return' AND k.status NOT IN ('delivered', 'returned')) THEN
    RAISE EXCEPTION 'this inspection is not open for the rental status %', k.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_window';
  END IF;
  IF NEW.vehicle_id <> k.vehicle_id THEN
    RAISE EXCEPTION 'the inspection is of the rental vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_vehicle';
  END IF;
  IF NEW.counterpart_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rental_drivers d WHERE d.company_id = NEW.company_id AND d.rental_id = NEW.rental_id AND d.customer_id = NEW.counterpart_customer_id AND d.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'the counterpart must be a driver of the rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_counterpart';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW.checklist) x WHERE x.key NOT IN ('keys', 'registration', 'spare_wheel', 'warning_triangle', 'first_aid_kit', 'lights', 'tyres', 'windscreen')
                OR jsonb_typeof(x.value) <> 'string' OR x.value #>> '{}' NOT IN ('ok', 'issue', 'not_applicable')) THEN
    RAISE EXCEPTION 'unknown checklist item or answer' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_checklist';
  END IF;
  IF NEW.state = 'final' THEN
    IF NEW.odometer_reading_id IS NULL OR NEW.location_event_id IS NULL THEN
      RAISE EXCEPTION 'a final inspection links its odometer reading and location event' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_history';
    END IF;
    IF NEW.cleanliness IS NULL OR NEW.condition IS NULL
       OR NOT (NEW.checklist ?& ARRAY['keys', 'registration', 'spare_wheel', 'warning_triangle', 'first_aid_kit', 'lights', 'tyres', 'windscreen'])
       OR (NEW.kind = 'handover' AND (NEW.counterpart_customer_id IS NULL OR NEW.km IS NULL OR NEW.fuel IS NULL)) THEN
      RAISE EXCEPTION 'a final inspection is complete' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_incomplete';
    END IF;
    SELECT count(*) INTO n FROM rental_inspection_photos p WHERE p.company_id = NEW.company_id AND p.inspection_id = NEW.id AND p.removed_at IS NULL;
    IF n < 4 OR n > 5 THEN
      RAISE EXCEPTION 'a final inspection has 4 or 5 photos, not %', n USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_photos';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- Runtime privileges: the setting is read, created and updated (never deleted) by the application.
GRANT SELECT, INSERT, UPDATE ON company_rental_settings TO acarvo_app;
