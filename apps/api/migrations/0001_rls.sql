-- Company isolation at the database level.
-- The API connects as acarvo_app: NOSUPERUSER, NOBYPASSRLS, not the table owner.
-- Context is set per transaction with set_config(..., true) by the API.

CREATE OR REPLACE FUNCTION app_company_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Company-scoped tables: RLS enabled and forced (applies to the owner too), one policy per command.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['memberships', 'roles', 'membership_roles', 'branches', 'membership_branches', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- A user may read their own memberships across companies (to choose a company).
CREATE POLICY memberships_select_own ON memberships FOR SELECT USING (user_id = app_user_id());
--> statement-breakpoint

-- Runtime role privileges: only what the API needs.
GRANT USAGE ON SCHEMA public TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_company_id(), app_user_id() TO acarvo_app;
--> statement-breakpoint
GRANT SELECT ON users, companies TO acarvo_app;
--> statement-breakpoint
GRANT UPDATE (last_login_at, updated_at, password_hash) ON users TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships, roles, membership_roles, branches, membership_branches TO acarvo_app;
--> statement-breakpoint
-- Audit is append-only for the API.
GRANT SELECT, INSERT ON audit_log TO acarvo_app;
