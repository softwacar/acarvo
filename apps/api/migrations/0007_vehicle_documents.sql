CREATE TABLE "company_document_type_settings" (
	"company_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"warn_days" integer DEFAULT 30 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_document_type_settings_company_id_type_code_pk" PRIMARY KEY("company_id","type_code"),
	CONSTRAINT "doc_settings_warn_days_check" CHECK ("company_document_type_settings"."warn_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"page_count" integer,
	"display_name" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "document_files_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "document_files_mime_check" CHECK ("document_files"."mime_type" in ('application/pdf', 'image/jpeg', 'image/png')),
	CONSTRAINT "document_files_size_check" CHECK ("document_files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"requires_expiry" boolean NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_document_files_file_key" UNIQUE("file_id"),
	CONSTRAINT "vehicle_document_files_version_key" UNIQUE("document_id","version_no"),
	CONSTRAINT "vehicle_document_files_version_check" CHECK ("vehicle_document_files"."version_no" >= 1)
);
--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"document_number" text,
	"issuer" text,
	"issued_on" date,
	"valid_from" date,
	"valid_until" date,
	"notes" text,
	"record_state" text NOT NULL,
	"renews_id" uuid,
	"voided_reason" text,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "vehicle_documents_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "vehicle_documents_dates_check" CHECK ("vehicle_documents"."valid_from" is null or "vehicle_documents"."valid_until" is null or "vehicle_documents"."valid_from" <= "vehicle_documents"."valid_until"),
	CONSTRAINT "vehicle_documents_state_check" CHECK ("vehicle_documents"."record_state" in ('draft', 'active', 'voided')),
	CONSTRAINT "vehicle_documents_void_check" CHECK (("vehicle_documents"."record_state" = 'voided') = ("vehicle_documents"."voided_at" is not null and "vehicle_documents"."voided_reason" is not null)),
	CONSTRAINT "vehicle_documents_version_check" CHECK ("vehicle_documents"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "company_document_type_settings" ADD CONSTRAINT "company_document_type_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_document_type_settings" ADD CONSTRAINT "company_document_type_settings_type_code_document_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."document_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_document_type_settings" ADD CONSTRAINT "company_document_type_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_document_files" ADD CONSTRAINT "vehicle_document_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_document_files" ADD CONSTRAINT "vehicle_document_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_document_files" ADD CONSTRAINT "vehicle_document_files_company_id_document_id_vehicle_documents_company_id_id_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "public"."vehicle_documents"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_document_files" ADD CONSTRAINT "vehicle_document_files_company_id_file_id_document_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."document_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_type_code_document_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."document_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_company_id_renews_id_vehicle_documents_company_id_id_fk" FOREIGN KEY ("company_id","renews_id") REFERENCES "public"."vehicle_documents"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_documents_vehicle_idx" ON "vehicle_documents" USING btree ("company_id","vehicle_id","type_code");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_documents_renews_once_key" ON "vehicle_documents" USING btree ("renews_id") WHERE "vehicle_documents"."renews_id" is not null and "vehicle_documents"."record_state" <> 'voided';