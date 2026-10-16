CREATE TABLE "damage_block_release_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"damage_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"usability" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_request_id" uuid,
	CONSTRAINT "damage_block_release_requests_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "damage_block_release_requests_status_check" CHECK ("damage_block_release_requests"."status" in ('requested', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "damage_block_release_requests_usability_check" CHECK ("damage_block_release_requests"."usability" in ('usable', 'restricted')),
	CONSTRAINT "damage_block_release_requests_reason_check" CHECK (char_length("damage_block_release_requests"."reason") between 5 and 300 and coalesce(char_length("damage_block_release_requests"."decision_note"), 0) <= 300),
	CONSTRAINT "damage_block_release_requests_decision_check" CHECK (("damage_block_release_requests"."status" = 'requested') = ("damage_block_release_requests"."decided_at" is null) and ("damage_block_release_requests"."decided_at" is null) = ("damage_block_release_requests"."decided_by" is null) and ("damage_block_release_requests"."decided_by" is null or "damage_block_release_requests"."decided_by" <> "damage_block_release_requests"."requested_by" or "damage_block_release_requests"."status" = 'cancelled')),
	CONSTRAINT "damage_block_release_requests_version_check" CHECK ("damage_block_release_requests"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "finance_responsible_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"finance_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"from_type" text NOT NULL,
	"from_customer_id" uuid,
	"from_corporate_id" uuid,
	"to_type" text NOT NULL,
	"to_customer_id" uuid,
	"to_corporate_id" uuid,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_request_id" uuid,
	CONSTRAINT "finance_responsible_corrections_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "finance_responsible_corrections_status_check" CHECK ("finance_responsible_corrections"."status" in ('requested', 'applied', 'rejected', 'cancelled')),
	CONSTRAINT "finance_responsible_corrections_parties_check" CHECK ((("finance_responsible_corrections"."from_type" = 'customer') = ("finance_responsible_corrections"."from_customer_id" is not null)) and (("finance_responsible_corrections"."from_type" = 'corporate') = ("finance_responsible_corrections"."from_corporate_id" is not null))
        and (("finance_responsible_corrections"."to_type" = 'customer') = ("finance_responsible_corrections"."to_customer_id" is not null)) and (("finance_responsible_corrections"."to_type" = 'corporate') = ("finance_responsible_corrections"."to_corporate_id" is not null))),
	CONSTRAINT "finance_responsible_corrections_reason_check" CHECK (char_length("finance_responsible_corrections"."reason") between 5 and 300 and coalesce(char_length("finance_responsible_corrections"."decision_note"), 0) <= 300),
	CONSTRAINT "finance_responsible_corrections_decision_check" CHECK (("finance_responsible_corrections"."status" = 'requested') = ("finance_responsible_corrections"."decided_at" is null) and ("finance_responsible_corrections"."decided_at" is null) = ("finance_responsible_corrections"."decided_by" is null) and ("finance_responsible_corrections"."decided_by" is null or "finance_responsible_corrections"."decided_by" <> "finance_responsible_corrections"."requested_by" or "finance_responsible_corrections"."status" = 'cancelled')),
	CONSTRAINT "finance_responsible_corrections_version_check" CHECK ("finance_responsible_corrections"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "transfer_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "transfer_photos_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "transfer_photos_file_key" UNIQUE("company_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD COLUMN "carrier_name" text;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD COLUMN "transport_reference" text;--> statement-breakpoint
ALTER TABLE "damage_block_release_requests" ADD CONSTRAINT "damage_block_release_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_block_release_requests" ADD CONSTRAINT "damage_block_release_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_block_release_requests" ADD CONSTRAINT "damage_block_release_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_block_release_requests" ADD CONSTRAINT "damage_block_release_requests_company_id_damage_id_damage_files_company_id_id_fk" FOREIGN KEY ("company_id","damage_id") REFERENCES "public"."damage_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_block_release_requests" ADD CONSTRAINT "damage_block_release_requests_company_id_block_id_damage_blocks_company_id_id_fk" FOREIGN KEY ("company_id","block_id") REFERENCES "public"."damage_blocks"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_company_id_finance_id_rental_finances_company_id_id_fk" FOREIGN KEY ("company_id","finance_id") REFERENCES "public"."rental_finances"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_company_id_from_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","from_customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_company_id_to_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","to_customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_company_id_from_corporate_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","from_corporate_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_responsible_corrections" ADD CONSTRAINT "finance_responsible_corrections_company_id_to_corporate_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","to_corporate_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_photos" ADD CONSTRAINT "transfer_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_photos" ADD CONSTRAINT "transfer_photos_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_photos" ADD CONSTRAINT "transfer_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_photos" ADD CONSTRAINT "transfer_photos_company_id_transfer_id_vehicle_transfers_company_id_id_fk" FOREIGN KEY ("company_id","transfer_id") REFERENCES "public"."vehicle_transfers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_photos" ADD CONSTRAINT "transfer_photos_company_id_file_id_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "damage_block_release_requests_open_key" ON "damage_block_release_requests" USING btree ("company_id","block_id") WHERE "damage_block_release_requests"."status" = 'requested';--> statement-breakpoint
CREATE UNIQUE INDEX "damage_block_release_requests_request_key" ON "damage_block_release_requests" USING btree ("company_id","client_request_id") WHERE "damage_block_release_requests"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "damage_block_release_requests_damage_idx" ON "damage_block_release_requests" USING btree ("company_id","damage_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_responsible_corrections_open_key" ON "finance_responsible_corrections" USING btree ("company_id","finance_id") WHERE "finance_responsible_corrections"."status" = 'requested';--> statement-breakpoint
CREATE UNIQUE INDEX "finance_responsible_corrections_request_key" ON "finance_responsible_corrections" USING btree ("company_id","client_request_id") WHERE "finance_responsible_corrections"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "finance_responsible_corrections_finance_idx" ON "finance_responsible_corrections" USING btree ("company_id","finance_id","requested_at");--> statement-breakpoint
CREATE INDEX "transfer_photos_transfer_idx" ON "transfer_photos" USING btree ("company_id","transfer_id");--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_carrier_check" CHECK (coalesce(char_length("vehicle_transfers"."carrier_name"), 0) <= 120 and coalesce(char_length("vehicle_transfers"."transport_reference"), 0) <= 60 and ("vehicle_transfers"."purpose" = 'repair' or ("vehicle_transfers"."carrier_name" is null and "vehicle_transfers"."transport_reference" is null)));