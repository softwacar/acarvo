-- Sensitive-action counters (M2 hardening): row level security instead of a global table.
-- A row is visible to its own user (limits that count across companies) and inside its company (per-company limits and
-- the per-company backup). The app may only add rows for itself in the active company. There is no UPDATE or DELETE
-- policy or privilege, so no request can reset or edit a counter. No existing row is changed.
ALTER TABLE user_sensitive_actions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_sensitive_actions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_sensitive_actions_select ON user_sensitive_actions FOR SELECT
  USING (user_id = app_user_id() OR company_id = app_company_id());
--> statement-breakpoint
CREATE POLICY user_sensitive_actions_insert ON user_sensitive_actions FOR INSERT
  WITH CHECK (user_id = app_user_id() AND company_id = app_company_id());
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON user_sensitive_actions FROM acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON user_sensitive_actions TO acarvo_app;
