CREATE TABLE "company_sequences" (
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"next_value" bigint NOT NULL,
	CONSTRAINT "company_sequences_company_id_kind_pk" PRIMARY KEY("company_id","kind"),
	CONSTRAINT "company_sequences_kind_check" CHECK ("company_sequences"."kind" in ('customer', 'corporate_account')),
	CONSTRAINT "company_sequences_next_check" CHECK ("company_sequences"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_no" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"display_name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"phone_raw" text,
	"phone_e164" text,
	"email" text,
	"residency" text NOT NULL,
	"nationality" text,
	"date_of_birth" date,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postal_code" text,
	"region" text,
	"address_country" text,
	"preferred_language" text,
	"contact_preference" text,
	"operational_note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_reason" text,
	"archived_by" uuid,
	"merged_into_id" uuid,
	"anonymized_at" timestamp with time zone,
	"processing_restricted" boolean DEFAULT false NOT NULL,
	"created_branch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "customers_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "customers_company_no_key" UNIQUE("company_id","customer_no"),
	CONSTRAINT "customers_no_check" CHECK ("customers"."customer_no" ~ '^M-[0-9]{6,}$'),
	CONSTRAINT "customers_name_check" CHECK (coalesce(btrim("customers"."given_name"), '') <> '' or coalesce(btrim("customers"."family_name"), '') <> ''),
	CONSTRAINT "customers_contact_check" CHECK ("customers"."phone_e164" is not null or "customers"."email" is not null or "customers"."status" = 'anonymized'),
	CONSTRAINT "customers_phone_check" CHECK ("customers"."phone_e164" is null or "customers"."phone_e164" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "customers_email_check" CHECK ("customers"."email" is null or ("customers"."email" = lower("customers"."email") and "customers"."email" like '%_@_%')),
	CONSTRAINT "customers_residency_check" CHECK ("customers"."residency" in ('local', 'foreign')),
	CONSTRAINT "customers_status_check" CHECK ("customers"."status" in ('active', 'archived', 'merged', 'anonymized')),
	CONSTRAINT "customers_country_check" CHECK (("customers"."nationality" is null or "customers"."nationality" ~ '^[A-Z]{2}$') and ("customers"."address_country" is null or "customers"."address_country" ~ '^[A-Z]{2}$')),
	CONSTRAINT "customers_dob_check" CHECK ("customers"."date_of_birth" is null or "customers"."date_of_birth" >= date '1900-01-01'),
	CONSTRAINT "customers_archive_check" CHECK (("customers"."status" = 'archived') = ("customers"."archived_at" is not null and "customers"."archived_reason" is not null)),
	CONSTRAINT "customers_archive_reason_check" CHECK ("customers"."archived_reason" is null or "customers"."archived_reason" in ('duplicate', 'inactive', 'customer_request', 'entry_error', 'other')),
	CONSTRAINT "customers_merged_check" CHECK (("customers"."status" = 'merged') = ("customers"."merged_into_id" is not null) and "customers"."merged_into_id" is distinct from "customers"."id"),
	CONSTRAINT "customers_version_check" CHECK ("customers"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "company_sequences" ADD CONSTRAINT "company_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_created_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","created_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_merged_into_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","merged_into_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_company_name_idx" ON "customers" USING btree ("company_id","status","name_normalized");--> statement-breakpoint
CREATE INDEX "customers_company_phone_idx" ON "customers" USING btree ("company_id","phone_e164");--> statement-breakpoint
CREATE INDEX "customers_company_email_idx" ON "customers" USING btree ("company_id","email");--> statement-breakpoint
CREATE INDEX "customers_company_created_idx" ON "customers" USING btree ("company_id","created_at");