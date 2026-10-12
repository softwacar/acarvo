CREATE TABLE "corporate_account_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"job_title" text,
	"note" text,
	"valid_from" date,
	"valid_until" date,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"ended_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "corporate_people_roles_check" CHECK (cardinality("corporate_account_people"."roles") between 1 and 6 and "corporate_account_people"."roles" <@ array['representative', 'contact', 'booker', 'authorized_driver', 'billing_contact', 'other']::text[]),
	CONSTRAINT "corporate_people_period_check" CHECK ("corporate_account_people"."valid_until" is null or "corporate_account_people"."valid_from" is null or "corporate_account_people"."valid_until" >= "corporate_account_people"."valid_from"),
	CONSTRAINT "corporate_people_end_check" CHECK (("corporate_account_people"."ended_at" is null) = ("corporate_account_people"."ended_reason" is null)),
	CONSTRAINT "corporate_people_end_reason_check" CHECK ("corporate_account_people"."ended_reason" is null or "corporate_account_people"."ended_reason" in ('left_company', 'role_ended', 'entry_error', 'other')),
	CONSTRAINT "corporate_people_version_check" CHECK ("corporate_account_people"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "corporate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_no" text NOT NULL,
	"legal_name" text NOT NULL,
	"legal_name_normalized" text NOT NULL,
	"trade_name" text,
	"country" text NOT NULL,
	"registration_number" text,
	"registration_number_normalized" text,
	"registration_authority" text,
	"preferred_language" text,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_reason" text,
	"archived_by" uuid,
	"created_branch_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "corporate_accounts_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "corporate_accounts_company_no_key" UNIQUE("company_id","account_no"),
	CONSTRAINT "corporate_accounts_no_check" CHECK ("corporate_accounts"."account_no" ~ '^K-[0-9]{5,}$'),
	CONSTRAINT "corporate_accounts_name_check" CHECK (btrim("corporate_accounts"."legal_name") <> ''),
	CONSTRAINT "corporate_accounts_country_check" CHECK ("corporate_accounts"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "corporate_accounts_status_check" CHECK ("corporate_accounts"."status" in ('active', 'archived')),
	CONSTRAINT "corporate_accounts_archive_check" CHECK (("corporate_accounts"."status" = 'archived') = ("corporate_accounts"."archived_at" is not null and "corporate_accounts"."archived_reason" is not null)),
	CONSTRAINT "corporate_accounts_archive_reason_check" CHECK ("corporate_accounts"."archived_reason" is null or "corporate_accounts"."archived_reason" in ('inactive', 'duplicate', 'customer_request', 'entry_error', 'other')),
	CONSTRAINT "corporate_accounts_version_check" CHECK ("corporate_accounts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "corporate_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"region" text,
	"postal_code" text,
	"country" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "corporate_addresses_kind_check" CHECK ("corporate_addresses"."kind" in ('registered', 'billing', 'postal', 'other')),
	CONSTRAINT "corporate_addresses_country_check" CHECK ("corporate_addresses"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "corporate_addresses_text_check" CHECK (btrim("corporate_addresses"."line1") <> '' and btrim("corporate_addresses"."city") <> ''),
	CONSTRAINT "corporate_addresses_version_check" CHECK ("corporate_addresses"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "corporate_contact_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"value_normalized" text NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "corporate_channels_kind_check" CHECK ("corporate_contact_channels"."kind" in ('phone', 'email', 'website', 'other')),
	CONSTRAINT "corporate_channels_value_check" CHECK (btrim("corporate_contact_channels"."value") <> '' and "corporate_contact_channels"."value_normalized" <> ''),
	CONSTRAINT "corporate_channels_version_check" CHECK ("corporate_contact_channels"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "corporate_tax_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"country" text NOT NULL,
	"scheme" text NOT NULL,
	"value" text NOT NULL,
	"value_normalized" text NOT NULL,
	"validity" text DEFAULT 'not_checked' NOT NULL,
	"note" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "corporate_tax_ids_country_check" CHECK ("corporate_tax_ids"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "corporate_tax_ids_scheme_check" CHECK ("corporate_tax_ids"."scheme" ~ '^[A-Z0-9_]{2,16}$'),
	CONSTRAINT "corporate_tax_ids_value_check" CHECK (btrim("corporate_tax_ids"."value") <> '' and "corporate_tax_ids"."value_normalized" <> ''),
	CONSTRAINT "corporate_tax_ids_validity_check" CHECK ("corporate_tax_ids"."validity" in ('not_checked', 'checked_by_staff', 'no_longer_used')),
	CONSTRAINT "corporate_tax_ids_version_check" CHECK ("corporate_tax_ids"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "corporate_account_people" ADD CONSTRAINT "corporate_account_people_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_people" ADD CONSTRAINT "corporate_account_people_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_people" ADD CONSTRAINT "corporate_account_people_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_people" ADD CONSTRAINT "corporate_account_people_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_people" ADD CONSTRAINT "corporate_account_people_company_id_account_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","account_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_people" ADD CONSTRAINT "corporate_account_people_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_company_id_created_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","created_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_addresses" ADD CONSTRAINT "corporate_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_addresses" ADD CONSTRAINT "corporate_addresses_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_addresses" ADD CONSTRAINT "corporate_addresses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_addresses" ADD CONSTRAINT "corporate_addresses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_addresses" ADD CONSTRAINT "corporate_addresses_company_id_account_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","account_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_contact_channels" ADD CONSTRAINT "corporate_contact_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_contact_channels" ADD CONSTRAINT "corporate_contact_channels_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_contact_channels" ADD CONSTRAINT "corporate_contact_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_contact_channels" ADD CONSTRAINT "corporate_contact_channels_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_contact_channels" ADD CONSTRAINT "corporate_contact_channels_company_id_account_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","account_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_tax_ids" ADD CONSTRAINT "corporate_tax_ids_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_tax_ids" ADD CONSTRAINT "corporate_tax_ids_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_tax_ids" ADD CONSTRAINT "corporate_tax_ids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_tax_ids" ADD CONSTRAINT "corporate_tax_ids_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_tax_ids" ADD CONSTRAINT "corporate_tax_ids_company_id_account_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","account_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corporate_people_account_idx" ON "corporate_account_people" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE INDEX "corporate_people_customer_idx" ON "corporate_account_people" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_people_active_key" ON "corporate_account_people" USING btree ("company_id","account_id","customer_id") WHERE "corporate_account_people"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "corporate_accounts_company_name_idx" ON "corporate_accounts" USING btree ("company_id","status","legal_name_normalized");--> statement-breakpoint
CREATE INDEX "corporate_accounts_company_created_idx" ON "corporate_accounts" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "corporate_accounts_company_registration_idx" ON "corporate_accounts" USING btree ("company_id","registration_number_normalized");--> statement-breakpoint
CREATE INDEX "corporate_addresses_account_idx" ON "corporate_addresses" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_addresses_primary_key" ON "corporate_addresses" USING btree ("company_id","account_id","kind") WHERE "corporate_addresses"."is_primary" and "corporate_addresses"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "corporate_channels_account_idx" ON "corporate_contact_channels" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE INDEX "corporate_channels_value_idx" ON "corporate_contact_channels" USING btree ("company_id","value_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_channels_primary_key" ON "corporate_contact_channels" USING btree ("company_id","account_id","kind") WHERE "corporate_contact_channels"."is_primary" and "corporate_contact_channels"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "corporate_tax_ids_account_idx" ON "corporate_tax_ids" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE INDEX "corporate_tax_ids_value_idx" ON "corporate_tax_ids" USING btree ("company_id","value_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_tax_ids_account_value_key" ON "corporate_tax_ids" USING btree ("company_id","account_id","country","scheme","value_normalized") WHERE "corporate_tax_ids"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_tax_ids_primary_key" ON "corporate_tax_ids" USING btree ("company_id","account_id") WHERE "corporate_tax_ids"."is_primary" and "corporate_tax_ids"."removed_at" is null;