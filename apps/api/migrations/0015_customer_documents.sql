CREATE TABLE "customer_document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"side" text NOT NULL,
	"version_no" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_document_files_file_key" UNIQUE("file_id"),
	CONSTRAINT "customer_document_files_version_key" UNIQUE("document_id","version_no"),
	CONSTRAINT "customer_document_files_side_check" CHECK ("customer_document_files"."side" in ('front', 'back', 'page')),
	CONSTRAINT "customer_document_files_version_check" CHECK ("customer_document_files"."version_no" >= 1)
);
--> statement-breakpoint
CREATE TABLE "customer_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"issuing_country" text,
	"issuing_authority" text,
	"title" text,
	"number_ciphertext" "bytea",
	"number_key_id" text,
	"number_hint" text,
	"number_lookup" text,
	"number_lookup_key_id" text,
	"issued_on" date,
	"valid_from" date,
	"valid_until" date,
	"license_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"license_first_issued_on" date,
	"entry_date" date,
	"note" text,
	"record_state" text DEFAULT 'active' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"voided_reason" text,
	"voided_note" text,
	"verification" text DEFAULT 'not_verified' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"renews_id" uuid,
	"locked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "customer_documents_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "customer_documents_type_check" CHECK ("customer_documents"."type" in ('national_id', 'passport', 'driving_license', 'international_driving_permit', 'residence_permit', 'visa', 'entry_record', 'other')),
	CONSTRAINT "customer_documents_country_check" CHECK ("customer_documents"."issuing_country" is null or "customer_documents"."issuing_country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "customer_documents_number_check" CHECK (("customer_documents"."number_ciphertext" is null) = ("customer_documents"."number_key_id" is null) and ("customer_documents"."number_ciphertext" is null) = ("customer_documents"."number_lookup" is null) and ("customer_documents"."number_ciphertext" is null) = ("customer_documents"."number_lookup_key_id" is null) and ("customer_documents"."number_ciphertext" is null) = ("customer_documents"."number_hint" is null)),
	CONSTRAINT "customer_documents_dates_check" CHECK ("customer_documents"."valid_from" is null or "customer_documents"."valid_until" is null or "customer_documents"."valid_from" <= "customer_documents"."valid_until"),
	CONSTRAINT "customer_documents_state_check" CHECK ("customer_documents"."record_state" in ('active', 'voided')),
	CONSTRAINT "customer_documents_void_check" CHECK (("customer_documents"."record_state" = 'voided') = ("customer_documents"."voided_at" is not null and "customer_documents"."voided_reason" is not null)),
	CONSTRAINT "customer_documents_void_reason_check" CHECK ("customer_documents"."voided_reason" is null or "customer_documents"."voided_reason" in ('entry_error', 'duplicate', 'wrong_customer', 'other')),
	CONSTRAINT "customer_documents_verification_check" CHECK ("customer_documents"."verification" in ('not_verified', 'original_seen', 'copy_only')),
	CONSTRAINT "customer_documents_entry_check" CHECK ("customer_documents"."type" <> 'entry_record' or ("customer_documents"."entry_date" is not null and "customer_documents"."number_ciphertext" is null)),
	CONSTRAINT "customer_documents_title_check" CHECK ("customer_documents"."type" <> 'other' or coalesce(btrim("customer_documents"."title"), '') <> ''),
	CONSTRAINT "customer_documents_renews_check" CHECK ("customer_documents"."renews_id" is distinct from "customer_documents"."id"),
	CONSTRAINT "customer_documents_version_check" CHECK ("customer_documents"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "customer_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"kind" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"pages" integer,
	"enc_key_id" text NOT NULL,
	"ciphertext_sha256" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "customer_files_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "customer_files_kind_check" CHECK ("customer_files"."kind" in ('pdf', 'jpeg', 'png')),
	CONSTRAINT "customer_files_size_check" CHECK ("customer_files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_sensitive_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sensitive_actions_action_check" CHECK ("user_sensitive_actions"."action" in ('document_number_reveal'))
);
--> statement-breakpoint
ALTER TABLE "customer_document_files" ADD CONSTRAINT "customer_document_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_document_files" ADD CONSTRAINT "customer_document_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_document_files" ADD CONSTRAINT "customer_document_files_company_id_document_id_customer_documents_company_id_id_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "public"."customer_documents"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_document_files" ADD CONSTRAINT "customer_document_files_company_id_file_id_customer_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."customer_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_company_id_renews_id_customer_documents_company_id_id_fk" FOREIGN KEY ("company_id","renews_id") REFERENCES "public"."customer_documents"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_files" ADD CONSTRAINT "customer_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_files" ADD CONSTRAINT "customer_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sensitive_actions" ADD CONSTRAINT "user_sensitive_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_documents_customer_idx" ON "customer_documents" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "customer_documents_lookup_idx" ON "customer_documents" USING btree ("company_id","number_lookup");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_documents_renews_once_key" ON "customer_documents" USING btree ("renews_id") WHERE "customer_documents"."renews_id" is not null and "customer_documents"."record_state" <> 'voided';--> statement-breakpoint
CREATE INDEX "user_sensitive_actions_user_at_idx" ON "user_sensitive_actions" USING btree ("user_id","action","at");