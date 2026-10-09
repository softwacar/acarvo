-- Vehicle documents: isolation, system types, integrity guards and runtime privileges.
-- Additive only: no existing row or table is changed.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_document_type_settings', 'document_files', 'vehicle_documents', 'vehicle_document_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Global system types (spec §59C). Not company data; company decisions live in company_document_type_settings.
INSERT INTO document_types (code, name, requires_expiry, sort_order) VALUES
  ('registration', 'Ruhsat', false, 10),
  ('inspection', 'Muayene', true, 20),
  ('liability_insurance', 'Trafik sigortası', true, 30),
  ('comprehensive_insurance', 'Kasko / diğer poliçe', true, 40),
  ('roadside_assistance', 'Yol yardım', true, 50),
  ('other', 'Diğer araç belgesi', false, 60)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

-- Integrity guard on document periods:
--  * an active period of a type that needs an end date must have one,
--  * a renewal points to an earlier period of the same vehicle and type,
--  * a voided period stays voided, and a locked period (pinned by a rental, later) is not corrected.
CREATE OR REPLACE FUNCTION vehicle_documents_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  needs_expiry boolean;
  prev record;
BEGIN
  SELECT requires_expiry INTO needs_expiry FROM document_types WHERE code = NEW.type_code;
  IF NEW.record_state = 'active' AND needs_expiry AND NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'active document of type % needs valid_until', NEW.type_code USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.renews_id IS NOT NULL THEN
    SELECT vehicle_id, type_code INTO prev FROM vehicle_documents WHERE company_id = NEW.company_id AND id = NEW.renews_id;
    IF prev IS NULL OR prev.vehicle_id <> NEW.vehicle_id OR prev.type_code <> NEW.type_code OR NEW.renews_id = NEW.id THEN
      RAISE EXCEPTION 'renewal must follow a period of the same vehicle and type' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.record_state = 'voided' THEN
      RAISE EXCEPTION 'voided document cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.vehicle_id <> OLD.vehicle_id OR NEW.type_code <> OLD.type_code OR NEW.renews_id IS DISTINCT FROM OLD.renews_id THEN
      RAISE EXCEPTION 'vehicle, type and renewal link are fixed' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.locked_at IS NOT NULL AND (NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
        OR NEW.document_number IS DISTINCT FROM OLD.document_number OR NEW.issued_on IS DISTINCT FROM OLD.issued_on) THEN
      RAISE EXCEPTION 'locked document cannot be corrected' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER vehicle_documents_guard BEFORE INSERT OR UPDATE ON vehicle_documents FOR EACH ROW EXECUTE FUNCTION vehicle_documents_guard();
--> statement-breakpoint
ALTER TABLE vehicle_documents ADD CONSTRAINT vehicle_documents_type_check CHECK (type_code IN ('registration', 'inspection', 'liability_insurance', 'comprehensive_insurance', 'roadside_assistance', 'other'));
--> statement-breakpoint

-- Runtime privileges: no DELETE anywhere, file records and versions are write-once.
GRANT SELECT ON document_types TO acarvo_app;
--> statement-breakpoint
GRANT SELECT ON company_document_type_settings TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON document_files, vehicle_document_files TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON vehicle_documents TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION vehicle_documents_guard() TO acarvo_app;
