CREATE TABLE "customer_document_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"warning_days" integer DEFAULT 30 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_document_settings_warning_check" CHECK ("customer_document_settings"."warning_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "document_requirement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"accepted_types" text[] NOT NULL,
	"original_seen_required" boolean DEFAULT false NOT NULL,
	"copy_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "document_requirement_items_position_key" UNIQUE("policy_id","position"),
	CONSTRAINT "document_requirement_items_types_check" CHECK (cardinality("document_requirement_items"."accepted_types") between 1 and 8),
	CONSTRAINT "document_requirement_items_position_check" CHECK ("document_requirement_items"."position" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "document_requirement_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"country" text NOT NULL,
	"residency_class" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"template_code" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	CONSTRAINT "document_requirement_policies_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "document_requirement_policies_version_key" UNIQUE("company_id","country","residency_class","version"),
	CONSTRAINT "document_requirement_policies_country_check" CHECK ("document_requirement_policies"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "document_requirement_policies_class_check" CHECK ("document_requirement_policies"."residency_class" in ('local', 'foreign')),
	CONSTRAINT "document_requirement_policies_status_check" CHECK ("document_requirement_policies"."status" in ('draft', 'active', 'retired')),
	CONSTRAINT "document_requirement_policies_version_check" CHECK ("document_requirement_policies"."version" >= 1),
	CONSTRAINT "document_requirement_policies_active_check" CHECK ("document_requirement_policies"."status" = 'draft' or "document_requirement_policies"."activated_at" is not null or "document_requirement_policies"."retired_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "customer_document_settings" ADD CONSTRAINT "customer_document_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_document_settings" ADD CONSTRAINT "customer_document_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_items" ADD CONSTRAINT "document_requirement_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_items" ADD CONSTRAINT "document_requirement_items_company_id_policy_id_document_requirement_policies_company_id_id_fk" FOREIGN KEY ("company_id","policy_id") REFERENCES "public"."document_requirement_policies"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_policies" ADD CONSTRAINT "document_requirement_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_policies" ADD CONSTRAINT "document_requirement_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_policies" ADD CONSTRAINT "document_requirement_policies_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_requirement_policies_active_key" ON "document_requirement_policies" USING btree ("company_id","country","residency_class") WHERE "document_requirement_policies"."status" = 'active';