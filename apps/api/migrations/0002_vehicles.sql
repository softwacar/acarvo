CREATE TABLE "odometer_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"km" integer NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "odometer_km_check" CHECK ("odometer_readings"."km" between 0 and 3000000)
);
--> statement-breakpoint
CREATE TABLE "vehicle_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_classes_company_name_key" UNIQUE("company_id","name"),
	CONSTRAINT "vehicle_classes_company_id_key" UNIQUE("company_id","id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_location_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"location_type" text NOT NULL,
	"branch_id" uuid,
	"description" text,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_branch_check" CHECK ("vehicle_location_events"."location_type" <> 'branch' or "vehicle_location_events"."branch_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"plate_normalized" text NOT NULL,
	"vehicle_code" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"model_year" integer,
	"class_id" uuid NOT NULL,
	"color" text,
	"vin" text,
	"fuel_type" text NOT NULL,
	"transmission" text NOT NULL,
	"seats" integer,
	"source" text DEFAULT 'internal' NOT NULL,
	"home_branch_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"acquisition_type" text,
	"acquisition_date" date,
	"acquisition_seller" text,
	"acquisition_cost_minor" bigint,
	"acquisition_currency" text,
	"acquisition_reference" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "vehicles_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "vehicles_company_plate_key" UNIQUE("company_id","plate_normalized"),
	CONSTRAINT "vehicles_model_year_check" CHECK ("vehicles"."model_year" is null or "vehicles"."model_year" between 1950 and 2100),
	CONSTRAINT "vehicles_seats_check" CHECK ("vehicles"."seats" is null or "vehicles"."seats" between 1 and 99),
	CONSTRAINT "vehicles_cost_check" CHECK (("vehicles"."acquisition_cost_minor" is null) = ("vehicles"."acquisition_currency" is null) and ("vehicles"."acquisition_cost_minor" is null or "vehicles"."acquisition_cost_minor" >= 0)),
	CONSTRAINT "vehicles_currency_check" CHECK ("vehicles"."acquisition_currency" is null or "vehicles"."acquisition_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "vehicles_version_check" CHECK ("vehicles"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_classes" ADD CONSTRAINT "vehicle_classes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD CONSTRAINT "vehicle_location_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD CONSTRAINT "vehicle_location_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD CONSTRAINT "vehicle_location_events_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_events" ADD CONSTRAINT "vehicle_location_events_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_class_id_vehicle_classes_company_id_id_fk" FOREIGN KEY ("company_id","class_id") REFERENCES "public"."vehicle_classes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_home_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","home_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "odometer_vehicle_time_idx" ON "odometer_readings" USING btree ("company_id","vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "location_vehicle_time_idx" ON "vehicle_location_events" USING btree ("company_id","vehicle_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_company_code_key" ON "vehicles" USING btree ("company_id",lower("vehicle_code")) WHERE "vehicles"."vehicle_code" is not null;--> statement-breakpoint
CREATE INDEX "vehicles_company_branch_idx" ON "vehicles" USING btree ("company_id","home_branch_id");