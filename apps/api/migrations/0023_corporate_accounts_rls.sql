-- Corporate accounts M3: company isolation, integrity guards and runtime privileges.
-- Additive only: no existing table or row is changed (docs/M3_KURUMSAL_HESAPLAR_PLANI.md §2).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['corporate_accounts', 'corporate_contact_channels', 'corporate_tax_ids', 'corporate_addresses', 'corporate_account_people'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- An account never moves to another company and keeps its number and creation facts.
CREATE OR REPLACE FUNCTION corporate_accounts_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.account_no <> OLD.account_no
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_branch_id IS DISTINCT FROM OLD.created_branch_id THEN
    RAISE EXCEPTION 'corporate account identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'corporate_accounts_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER corporate_accounts_guard BEFORE UPDATE ON corporate_accounts FOR EACH ROW EXECUTE FUNCTION corporate_accounts_guard();
--> statement-breakpoint

-- Channels, tax ids and addresses stay with their account; a removed one is final.
CREATE OR REPLACE FUNCTION corporate_subrecord_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.account_id <> OLD.account_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'corporate record identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'corporate_subrecord_immutable';
  END IF;
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a removed corporate record cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'corporate_subrecord_removed_final';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER corporate_contact_channels_guard BEFORE UPDATE ON corporate_contact_channels FOR EACH ROW EXECUTE FUNCTION corporate_subrecord_guard();
--> statement-breakpoint
CREATE TRIGGER corporate_tax_ids_guard BEFORE UPDATE ON corporate_tax_ids FOR EACH ROW EXECUTE FUNCTION corporate_subrecord_guard();
--> statement-breakpoint
CREATE TRIGGER corporate_addresses_guard BEFORE UPDATE ON corporate_addresses FOR EACH ROW EXECUTE FUNCTION corporate_subrecord_guard();
--> statement-breakpoint

-- A link always joins the same account and person; an ended link is history and cannot change.
CREATE OR REPLACE FUNCTION corporate_account_people_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.account_id <> OLD.account_id OR NEW.customer_id <> OLD.customer_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'corporate link identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'corporate_people_immutable';
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'an ended corporate link cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'corporate_people_ended_final';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER corporate_account_people_guard BEFORE UPDATE ON corporate_account_people FOR EACH ROW EXECUTE FUNCTION corporate_account_people_guard();
--> statement-breakpoint

-- Runtime privileges: nothing is deleted (accounts are archived, records removed by a mark, links ended).
GRANT SELECT, INSERT, UPDATE ON corporate_accounts, corporate_contact_channels, corporate_tax_ids, corporate_addresses, corporate_account_people TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION corporate_accounts_guard(), corporate_subrecord_guard(), corporate_account_people_guard() TO acarvo_app;
