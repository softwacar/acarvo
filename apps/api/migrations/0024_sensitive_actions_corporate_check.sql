-- Rate-limit counters (0020/0021) get one more kind: live duplicate suggestions of corporate accounts, counted in the
-- database instead of server memory. Only the list of allowed values grows; existing rows already satisfy it.

ALTER TABLE "user_sensitive_actions" DROP CONSTRAINT "user_sensitive_actions_action_check";--> statement-breakpoint
ALTER TABLE "user_sensitive_actions" ADD CONSTRAINT "user_sensitive_actions_action_check" CHECK ("user_sensitive_actions"."action" in ('document_number_reveal', 'document_number_check', 'corporate_duplicate_check'));