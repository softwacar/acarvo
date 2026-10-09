CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_thumb_key_unique" UNIQUE("thumb_key"),
	CONSTRAINT "files_company_id_key" UNIQUE("company_id","id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_promo_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_photos_file_key" UNIQUE("file_id"),
	CONSTRAINT "promo_photos_position_check" CHECK ("vehicle_promo_photos"."position" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_promo_photos" ADD CONSTRAINT "vehicle_promo_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_promo_photos" ADD CONSTRAINT "vehicle_promo_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_promo_photos" ADD CONSTRAINT "vehicle_promo_photos_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_promo_photos" ADD CONSTRAINT "vehicle_promo_photos_company_id_file_id_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_photos_one_primary_key" ON "vehicle_promo_photos" USING btree ("vehicle_id") WHERE "vehicle_promo_photos"."is_primary";--> statement-breakpoint
CREATE INDEX "promo_photos_vehicle_idx" ON "vehicle_promo_photos" USING btree ("company_id","vehicle_id");