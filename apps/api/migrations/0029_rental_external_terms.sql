CREATE TABLE "company_rental_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"external_terms_mode" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "external_pricing_ack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "external_pricing_ack_by" uuid;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "external_reference" text;--> statement-breakpoint
ALTER TABLE "company_rental_settings" ADD CONSTRAINT "company_rental_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_rental_settings" ADD CONSTRAINT "company_rental_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_external_pricing_ack_by_users_id_fk" FOREIGN KEY ("external_pricing_ack_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_external_reference_check" CHECK ("rentals"."external_reference" is null or (char_length("rentals"."external_reference") between 3 and 40 and "rentals"."external_reference" ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$'));