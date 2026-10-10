CREATE TABLE "odometer_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"reading_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"client_request_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "odometer_corrections_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "odometer_corrections_reading_key" UNIQUE("company_id","reading_id"),
	CONSTRAINT "odometer_corrections_reason_check" CHECK (char_length("odometer_corrections"."reason") between 5 and 300)
);
--> statement-breakpoint
CREATE TABLE "vehicle_location_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"client_request_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_location_corrections_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "vehicle_location_corrections_event_key" UNIQUE("company_id","event_id"),
	CONSTRAINT "vehicle_location_corrections_reason_check" CHECK (char_length("vehicle_location_corrections"."reason") between 5 and 300)
);
--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD COLUMN "jump_reason" text;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_company_id_key" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD CONSTRAINT "vehicle_location_events_company_id_key" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "odometer_corrections" ADD CONSTRAINT "odometer_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometer_corrections" ADD CONSTRAINT "odometer_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometer_corrections" ADD CONSTRAINT "odometer_corrections_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometer_corrections" ADD CONSTRAINT "odometer_corrections_company_id_reading_id_odometer_readings_company_id_id_fk" FOREIGN KEY ("company_id","reading_id") REFERENCES "public"."odometer_readings"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_corrections" ADD CONSTRAINT "vehicle_location_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_corrections" ADD CONSTRAINT "vehicle_location_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_corrections" ADD CONSTRAINT "vehicle_location_corrections_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_corrections" ADD CONSTRAINT "vehicle_location_corrections_company_id_event_id_vehicle_location_events_company_id_id_fk" FOREIGN KEY ("company_id","event_id") REFERENCES "public"."vehicle_location_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "odometer_corrections_request_key" ON "odometer_corrections" USING btree ("company_id","client_request_id") WHERE "odometer_corrections"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "odometer_corrections_vehicle_idx" ON "odometer_corrections" USING btree ("company_id","vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_location_corrections_request_key" ON "vehicle_location_corrections" USING btree ("company_id","client_request_id") WHERE "vehicle_location_corrections"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "vehicle_location_corrections_vehicle_idx" ON "vehicle_location_corrections" USING btree ("company_id","vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "odometer_readings_request_key" ON "odometer_readings" USING btree ("company_id","client_request_id") WHERE "odometer_readings"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "odometer_readings_correction_key" ON "odometer_readings" USING btree ("company_id","source_id") WHERE "odometer_readings"."source_type" = 'correction';--> statement-breakpoint
CREATE UNIQUE INDEX "location_events_request_key" ON "vehicle_location_events" USING btree ("company_id","client_request_id") WHERE "vehicle_location_events"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "location_events_correction_key" ON "vehicle_location_events" USING btree ("company_id","source_id") WHERE "vehicle_location_events"."source_type" = 'correction';
