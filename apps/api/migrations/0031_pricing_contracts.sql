CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"data" jsonb,
	"client_request_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_events_kind_check" CHECK ("contract_events"."kind" in ('created', 'review', 'external', 'archived', 'superseded', 'viewed', 'downloaded'))
);
--> statement-breakpoint
CREATE TABLE "contract_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "contract_files_contract_key" UNIQUE("company_id","contract_id"),
	CONSTRAINT "contract_files_sha_check" CHECK ("contract_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "contract_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"activated_at" timestamp with time zone,
	"activated_by" uuid,
	"retired_at" timestamp with time zone,
	CONSTRAINT "contract_template_versions_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "contract_template_versions_no_key" UNIQUE("company_id","template_id","version_no"),
	CONSTRAINT "contract_template_versions_status_check" CHECK ("contract_template_versions"."status" in ('draft', 'active', 'retired')),
	CONSTRAINT "contract_template_versions_body_check" CHECK (char_length("contract_template_versions"."body") <= 20000),
	CONSTRAINT "contract_template_versions_active_check" CHECK ("contract_template_versions"."status" = 'draft' or "contract_template_versions"."activated_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"country" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "contract_templates_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "contract_templates_language_check" CHECK ("contract_templates"."language" in ('tr', 'bs', 'en', 'de', 'hr', 'sr')),
	CONSTRAINT "contract_templates_country_check" CHECK ("contract_templates"."country" is null or "contract_templates"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "contract_templates_name_check" CHECK (char_length("contract_templates"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_no" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"rental_id" uuid NOT NULL,
	"reservation_id" uuid,
	"quote_id" uuid,
	"template_version_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"external_ack_at" timestamp with time zone,
	"external_ack_by" uuid,
	"external_reference" text,
	"archive_reason" text,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "contracts_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "contracts_company_no_key" UNIQUE("company_id","contract_no","revision"),
	CONSTRAINT "contracts_request_key" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "contracts_no_check" CHECK ("contracts"."contract_no" ~ '^S-[0-9]{6,}$'),
	CONSTRAINT "contracts_status_check" CHECK ("contracts"."status" in ('draft', 'under_review', 'externally_processed', 'archived', 'superseded')),
	CONSTRAINT "contracts_external_check" CHECK (("contracts"."status" = 'externally_processed') = ("contracts"."external_ack_at" is not null and "contracts"."external_ack_by" is not null and "contracts"."external_reference" is not null) or ("contracts"."status" in ('archived', 'superseded') and "contracts"."external_ack_at" is not null)),
	CONSTRAINT "contracts_external_reference_check" CHECK ("contracts"."external_reference" is null or (char_length("contracts"."external_reference") between 3 and 40 and "contracts"."external_reference" ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$')),
	CONSTRAINT "contracts_archive_check" CHECK (("contracts"."status" = 'archived') = ("contracts"."archive_reason" is not null)),
	CONSTRAINT "contracts_revision_check" CHECK ("contracts"."revision" >= 1 and "contracts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "price_list_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"value" bigint NOT NULL,
	"min_days" integer NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "price_list_discounts_check" CHECK ("price_list_discounts"."type" in ('percent', 'fixed') and "price_list_discounts"."value" >= 1 and ("price_list_discounts"."type" <> 'percent' or "price_list_discounts"."value" <= 10000) and "price_list_discounts"."value" <= 10000000000 and "price_list_discounts"."min_days" between 1 and 366)
);
--> statement-breakpoint
CREATE TABLE "price_list_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"max_quantity" integer NOT NULL,
	"taxable" boolean NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "price_list_extras_code_key" UNIQUE("company_id","price_list_id","revision","code"),
	CONSTRAINT "price_list_extras_kind_check" CHECK ("price_list_extras"."kind" in ('standard', 'additional_driver') and "price_list_extras"."mode" in ('per_day', 'per_rental')),
	CONSTRAINT "price_list_extras_amount_check" CHECK ("price_list_extras"."price_minor" between 0 and 10000000000 and "price_list_extras"."max_quantity" between 1 and 20),
	CONSTRAINT "price_list_extras_code_check" CHECK ("price_list_extras"."code" ~ '^[A-Z0-9_-]{2,20}$')
);
--> statement-breakpoint
CREATE TABLE "price_list_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"vehicle_class_id" uuid NOT NULL,
	"rate_1_6_minor" bigint NOT NULL,
	"rate_7_29_minor" bigint,
	"rate_30_plus_minor" bigint,
	CONSTRAINT "price_list_rates_class_key" UNIQUE("company_id","price_list_id","revision","vehicle_class_id"),
	CONSTRAINT "price_list_rates_amount_check" CHECK ("price_list_rates"."rate_1_6_minor" between 0 and 10000000000 and coalesce("price_list_rates"."rate_7_29_minor", 0) between 0 and 10000000000 and coalesce("price_list_rates"."rate_30_plus_minor", 0) between 0 and 10000000000)
);
--> statement-breakpoint
CREATE TABLE "price_list_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"day_method" text NOT NULL,
	"grace_minutes" integer NOT NULL,
	"min_days" integer NOT NULL,
	"tax_mode" text NOT NULL,
	"tax_rate_bp" integer,
	"tax_label" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "price_list_revisions_key" UNIQUE("company_id","price_list_id","revision"),
	CONSTRAINT "price_list_revisions_day_method_check" CHECK ("price_list_revisions"."day_method" in ('rolling_24h', 'calendar_day')),
	CONSTRAINT "price_list_revisions_grace_check" CHECK ("price_list_revisions"."grace_minutes" between 0 and 180),
	CONSTRAINT "price_list_revisions_min_days_check" CHECK ("price_list_revisions"."min_days" between 1 and 30),
	CONSTRAINT "price_list_revisions_tax_check" CHECK ("price_list_revisions"."tax_mode" in ('not_configured', 'exclusive', 'inclusive') and (("price_list_revisions"."tax_mode" = 'not_configured') = ("price_list_revisions"."tax_rate_bp" is null))),
	CONSTRAINT "price_list_revisions_tax_rate_check" CHECK ("price_list_revisions"."tax_rate_bp" is null or "price_list_revisions"."tax_rate_bp" between 1 and 10000),
	CONSTRAINT "price_list_revisions_revision_check" CHECK ("price_list_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "price_list_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"vehicle_class_id" uuid,
	"percent_bp" integer NOT NULL,
	"priority" integer NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "price_list_seasons_dates_check" CHECK ("price_list_seasons"."end_date" >= "price_list_seasons"."start_date"),
	CONSTRAINT "price_list_seasons_percent_check" CHECK ("price_list_seasons"."percent_bp" between -9000 and 50000),
	CONSTRAINT "price_list_seasons_priority_check" CHECK ("price_list_seasons"."priority" between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"branch_id" uuid,
	"valid_from" date,
	"valid_until" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "price_lists_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "price_lists_currency_check" CHECK ("price_lists"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "price_lists_status_check" CHECK ("price_lists"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "price_lists_valid_check" CHECK ("price_lists"."valid_from" is null or "price_lists"."valid_until" is null or "price_lists"."valid_until" >= "price_lists"."valid_from"),
	CONSTRAINT "price_lists_priority_check" CHECK ("price_lists"."priority" between 0 and 1000),
	CONSTRAINT "price_lists_name_check" CHECK (char_length("price_lists"."name") between 1 and 80),
	CONSTRAINT "price_lists_version_check" CHECK ("price_lists"."version" >= 1 and "price_lists"."current_revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "price_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quote_no" text NOT NULL,
	"status" text DEFAULT 'quoted' NOT NULL,
	"reservation_id" uuid,
	"rental_id" uuid,
	"price_list_id" uuid NOT NULL,
	"price_list_revision" integer NOT NULL,
	"currency" text NOT NULL,
	"vehicle_class_id" uuid NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"pickup_timezone" text NOT NULL,
	"days" integer NOT NULL,
	"tier" text NOT NULL,
	"day_method" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"net_minor" bigint NOT NULL,
	"tax_minor" bigint,
	"gross_minor" bigint,
	"tax_status" text NOT NULL,
	"engine_version" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_request_id" uuid NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "price_quotes_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "price_quotes_company_no_key" UNIQUE("company_id","quote_no"),
	CONSTRAINT "price_quotes_request_key" UNIQUE("company_id","client_request_id"),
	CONSTRAINT "price_quotes_no_check" CHECK ("price_quotes"."quote_no" ~ '^Q-[0-9]{6,}$'),
	CONSTRAINT "price_quotes_target_check" CHECK (("price_quotes"."reservation_id" is null) <> ("price_quotes"."rental_id" is null)),
	CONSTRAINT "price_quotes_status_check" CHECK ("price_quotes"."status" in ('quoted', 'superseded') and (("price_quotes"."status" = 'superseded') = ("price_quotes"."superseded_at" is not null))),
	CONSTRAINT "price_quotes_tax_check" CHECK ("price_quotes"."tax_status" in ('complete', 'not_configured') and (("price_quotes"."tax_status" = 'complete') = ("price_quotes"."tax_minor" is not null and "price_quotes"."gross_minor" is not null))),
	CONSTRAINT "price_quotes_period_check" CHECK ("price_quotes"."return_at" > "price_quotes"."pickup_at" and "price_quotes"."days" >= 1),
	CONSTRAINT "price_quotes_currency_check" CHECK ("price_quotes"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "company_sequences" DROP CONSTRAINT "company_sequences_kind_check";--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_company_id_contract_id_contracts_company_id_id_fk" FOREIGN KEY ("company_id","contract_id") REFERENCES "public"."contracts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_files" ADD CONSTRAINT "contract_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_files" ADD CONSTRAINT "contract_files_company_id_contract_id_contracts_company_id_id_fk" FOREIGN KEY ("company_id","contract_id") REFERENCES "public"."contracts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_company_id_template_id_contract_templates_company_id_id_fk" FOREIGN KEY ("company_id","template_id") REFERENCES "public"."contract_templates"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_external_ack_by_users_id_fk" FOREIGN KEY ("external_ack_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_reservation_id_reservations_company_id_id_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "public"."reservations"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_quote_id_price_quotes_company_id_id_fk" FOREIGN KEY ("company_id","quote_id") REFERENCES "public"."price_quotes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_template_version_id_contract_template_versions_company_id_id_fk" FOREIGN KEY ("company_id","template_version_id") REFERENCES "public"."contract_template_versions"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_supersedes_id_contracts_company_id_id_fk" FOREIGN KEY ("company_id","supersedes_id") REFERENCES "public"."contracts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_discounts" ADD CONSTRAINT "price_list_discounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_discounts" ADD CONSTRAINT "price_list_discounts_company_id_price_list_id_revision_price_list_revisions_company_id_price_list_id_revision_fk" FOREIGN KEY ("company_id","price_list_id","revision") REFERENCES "public"."price_list_revisions"("company_id","price_list_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_extras" ADD CONSTRAINT "price_list_extras_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_extras" ADD CONSTRAINT "price_list_extras_company_id_price_list_id_revision_price_list_revisions_company_id_price_list_id_revision_fk" FOREIGN KEY ("company_id","price_list_id","revision") REFERENCES "public"."price_list_revisions"("company_id","price_list_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_rates" ADD CONSTRAINT "price_list_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_rates" ADD CONSTRAINT "price_list_rates_company_id_price_list_id_revision_price_list_revisions_company_id_price_list_id_revision_fk" FOREIGN KEY ("company_id","price_list_id","revision") REFERENCES "public"."price_list_revisions"("company_id","price_list_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_rates" ADD CONSTRAINT "price_list_rates_company_id_vehicle_class_id_vehicle_classes_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_class_id") REFERENCES "public"."vehicle_classes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_revisions" ADD CONSTRAINT "price_list_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_revisions" ADD CONSTRAINT "price_list_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_revisions" ADD CONSTRAINT "price_list_revisions_company_id_price_list_id_price_lists_company_id_id_fk" FOREIGN KEY ("company_id","price_list_id") REFERENCES "public"."price_lists"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_seasons" ADD CONSTRAINT "price_list_seasons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_seasons" ADD CONSTRAINT "price_list_seasons_company_id_price_list_id_revision_price_list_revisions_company_id_price_list_id_revision_fk" FOREIGN KEY ("company_id","price_list_id","revision") REFERENCES "public"."price_list_revisions"("company_id","price_list_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_seasons" ADD CONSTRAINT "price_list_seasons_company_id_vehicle_class_id_vehicle_classes_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_class_id") REFERENCES "public"."vehicle_classes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_company_id_reservation_id_reservations_company_id_id_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "public"."reservations"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_company_id_price_list_id_price_list_revision_price_list_revisions_company_id_price_list_id_revision_fk" FOREIGN KEY ("company_id","price_list_id","price_list_revision") REFERENCES "public"."price_list_revisions"("company_id","price_list_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quotes" ADD CONSTRAINT "price_quotes_company_id_vehicle_class_id_vehicle_classes_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_class_id") REFERENCES "public"."vehicle_classes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_events_contract_idx" ON "contract_events" USING btree ("company_id","contract_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_request_key" ON "contract_events" USING btree ("company_id","client_request_id") WHERE "contract_events"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_template_versions_active_key" ON "contract_template_versions" USING btree ("company_id","template_id") WHERE "contract_template_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "contract_template_versions_draft_key" ON "contract_template_versions" USING btree ("company_id","template_id") WHERE "contract_template_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_rental_open_key" ON "contracts" USING btree ("company_id","rental_id") WHERE "contracts"."status" in ('draft', 'under_review', 'externally_processed');--> statement-breakpoint
CREATE INDEX "contracts_rental_idx" ON "contracts" USING btree ("company_id","rental_id","created_at");--> statement-breakpoint
CREATE INDEX "contracts_company_created_idx" ON "contracts" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "price_list_discounts_list_idx" ON "price_list_discounts" USING btree ("company_id","price_list_id","revision");--> statement-breakpoint
CREATE INDEX "price_list_seasons_list_idx" ON "price_list_seasons" USING btree ("company_id","price_list_id","revision");--> statement-breakpoint
CREATE INDEX "price_lists_company_status_idx" ON "price_lists" USING btree ("company_id","status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "price_quotes_reservation_current_key" ON "price_quotes" USING btree ("company_id","reservation_id") WHERE "price_quotes"."status" = 'quoted' and "price_quotes"."reservation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "price_quotes_rental_current_key" ON "price_quotes" USING btree ("company_id","rental_id") WHERE "price_quotes"."status" = 'quoted' and "price_quotes"."rental_id" is not null;--> statement-breakpoint
CREATE INDEX "price_quotes_reservation_idx" ON "price_quotes" USING btree ("company_id","reservation_id","created_at");--> statement-breakpoint
CREATE INDEX "price_quotes_rental_idx" ON "price_quotes" USING btree ("company_id","rental_id","created_at");--> statement-breakpoint
CREATE INDEX "price_quotes_list_idx" ON "price_quotes" USING btree ("company_id","price_list_id");--> statement-breakpoint
ALTER TABLE "company_sequences" ADD CONSTRAINT "company_sequences_kind_check" CHECK ("company_sequences"."kind" in ('customer', 'corporate_account', 'reservation', 'rental', 'price_quote', 'contract'));