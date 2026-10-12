-- Sensitive-action counters get their company (M2 hardening): rows are written in a company context, so they can be
-- isolated by RLS (0021) and kept in the per-company backups. The table only holds rate-limit counters (user, company,
-- action kind, time). Adding a NOT NULL column fails, and the whole migration rolls back, if the table has rows;
-- nothing is converted or deleted. Main and test databases had 0 rows when this was written.

ALTER TABLE "user_sensitive_actions" DROP CONSTRAINT "user_sensitive_actions_action_check";--> statement-breakpoint
ALTER TABLE "user_sensitive_actions" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sensitive_actions" ADD CONSTRAINT "user_sensitive_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sensitive_actions_company_user_at_idx" ON "user_sensitive_actions" USING btree ("company_id","user_id","action","at");--> statement-breakpoint
ALTER TABLE "user_sensitive_actions" ADD CONSTRAINT "user_sensitive_actions_action_check" CHECK ("user_sensitive_actions"."action" in ('document_number_reveal', 'document_number_check'));