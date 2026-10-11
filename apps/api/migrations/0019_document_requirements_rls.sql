-- Customer document requirements (M2e): company isolation, version immutability and runtime privileges.
-- Additive only. No policy is created or activated by this migration: nothing applies until an owner activates one.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_document_settings', 'document_requirement_policies', 'document_requirement_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- A policy version keeps its identity; status only moves draft → active → retired (or draft → retired).
CREATE OR REPLACE FUNCTION document_requirement_policies_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.country <> OLD.country OR NEW.residency_class <> OLD.residency_class
     OR NEW.version <> OLD.version OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.template_code IS DISTINCT FROM OLD.template_code THEN
    RAISE EXCEPTION 'requirement policy identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'document_requirement_policies_immutable';
  END IF;
  IF NOT ((OLD.status = NEW.status AND OLD.status = 'draft')
          OR (OLD.status = 'draft' AND NEW.status IN ('active', 'retired'))
          OR (OLD.status = 'active' AND NEW.status = 'retired')) THEN
    RAISE EXCEPTION 'requirement policy status change not allowed' USING ERRCODE = 'check_violation', CONSTRAINT = 'document_requirement_policies_status';
  END IF;
  IF OLD.status = 'active' AND (NEW.activated_at IS DISTINCT FROM OLD.activated_at OR NEW.activated_by IS DISTINCT FROM OLD.activated_by) THEN
    RAISE EXCEPTION 'an activated policy keeps its activation record' USING ERRCODE = 'check_violation', CONSTRAINT = 'document_requirement_policies_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER document_requirement_policies_guard BEFORE UPDATE ON document_requirement_policies FOR EACH ROW EXECUTE FUNCTION document_requirement_policies_guard();
--> statement-breakpoint

-- Items change only while their policy is a draft; an activated version is never edited.
CREATE OR REPLACE FUNCTION document_requirement_items_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  st text;
  pol uuid;
BEGIN
  pol := CASE WHEN TG_OP = 'DELETE' THEN OLD.policy_id ELSE NEW.policy_id END;
  SELECT status INTO st FROM document_requirement_policies WHERE id = pol;
  IF st IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'requirement items can only change in a draft policy' USING ERRCODE = 'check_violation', CONSTRAINT = 'document_requirement_items_draft_only';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.policy_id <> OLD.policy_id OR NEW.company_id <> OLD.company_id) THEN
    RAISE EXCEPTION 'requirement items stay in their policy' USING ERRCODE = 'check_violation', CONSTRAINT = 'document_requirement_items_draft_only';
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM unnest(NEW.accepted_types) t
       WHERE t NOT IN ('national_id', 'passport', 'driving_license', 'international_driving_permit', 'residence_permit', 'visa', 'entry_record', 'other')) THEN
    RAISE EXCEPTION 'unknown document type in requirement item' USING ERRCODE = 'check_violation', CONSTRAINT = 'document_requirement_items_types_check';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER document_requirement_items_guard BEFORE INSERT OR UPDATE OR DELETE ON document_requirement_items FOR EACH ROW EXECUTE FUNCTION document_requirement_items_guard();
--> statement-breakpoint

-- Runtime privileges: settings and policies are never deleted; draft items may be replaced (guarded above).
GRANT SELECT, INSERT, UPDATE ON customer_document_settings, document_requirement_policies TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON document_requirement_items TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION document_requirement_policies_guard(), document_requirement_items_guard() TO acarvo_app;
