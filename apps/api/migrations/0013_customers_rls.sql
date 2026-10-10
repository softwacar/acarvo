-- Customers M1: company isolation, immutable identity columns and runtime privileges.
-- Additive only: no existing table or row is changed (docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md §2, §15.1).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_sequences', 'customers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- A customer never moves to another company and keeps its number and creation facts.
CREATE OR REPLACE FUNCTION customers_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.customer_no <> OLD.customer_no
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_branch_id IS DISTINCT FROM OLD.created_branch_id THEN
    RAISE EXCEPTION 'customer identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'customers_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customers_guard BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION customers_guard();
--> statement-breakpoint

-- Counters only move forward and stay in their company.
CREATE OR REPLACE FUNCTION company_sequences_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.kind <> OLD.kind OR NEW.next_value < OLD.next_value THEN
    RAISE EXCEPTION 'company sequences only move forward' USING ERRCODE = 'check_violation', CONSTRAINT = 'company_sequences_forward';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER company_sequences_guard BEFORE UPDATE ON company_sequences FOR EACH ROW EXECUTE FUNCTION company_sequences_guard();
--> statement-breakpoint

-- Runtime privileges: customers are archived, never deleted; counters are never deleted.
GRANT SELECT, INSERT, UPDATE ON customers, company_sequences TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION customers_guard(), company_sequences_guard() TO acarvo_app;
