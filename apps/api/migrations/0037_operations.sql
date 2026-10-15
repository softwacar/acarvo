CREATE TABLE "damage_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"damage_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"started_by" uuid,
	"start_reason" text NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "damage_blocks_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "damage_blocks_reason_check" CHECK (char_length("damage_blocks"."start_reason") between 5 and 300),
	CONSTRAINT "damage_blocks_end_check" CHECK (("damage_blocks"."ended_at" is null) = ("damage_blocks"."end_reason" is null) and ("damage_blocks"."ended_at" is null or ("damage_blocks"."ended_at" >= "damage_blocks"."started_at" and char_length("damage_blocks"."end_reason") between 5 and 300 and "damage_blocks"."ended_by" is not null)))
);
--> statement-breakpoint
CREATE TABLE "damage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"damage_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"data" jsonb,
	"client_request_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "damage_events_kind_check" CHECK ("damage_events"."kind" in ('created', 'updated', 'review', 'repair', 'blocked', 'unblocked', 'closed', 'photo_added', 'photo_removed'))
);
--> statement-breakpoint
CREATE TABLE "damage_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"damage_no" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"rental_id" uuid,
	"inspection_id" uuid,
	"source_mark_id" uuid,
	"detected_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"location_text" text,
	"view" text NOT NULL,
	"area" text,
	"description" text NOT NULL,
	"damage_type" text NOT NULL,
	"severity" text NOT NULL,
	"usability" text NOT NULL,
	"review_status" text DEFAULT 'reported' NOT NULL,
	"repair_status" text DEFAULT 'pending' NOT NULL,
	"assessment_note" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"close_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "damage_files_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "damage_files_company_no_key" UNIQUE("company_id","damage_no"),
	CONSTRAINT "damage_files_no_check" CHECK ("damage_files"."damage_no" ~ '^H-[0-9]{6,}$'),
	CONSTRAINT "damage_files_view_check" CHECK ("damage_files"."view" in ('front', 'rear', 'left', 'right', 'top', 'interior')),
	CONSTRAINT "damage_files_type_check" CHECK ("damage_files"."damage_type" in ('scratch', 'dent', 'crack', 'glass', 'tire', 'mechanical', 'interior', 'missing_part', 'other')),
	CONSTRAINT "damage_files_severity_check" CHECK ("damage_files"."severity" in ('minor', 'moderate', 'severe')),
	CONSTRAINT "damage_files_usability_check" CHECK ("damage_files"."usability" in ('usable', 'restricted', 'not_usable')),
	CONSTRAINT "damage_files_review_check" CHECK ("damage_files"."review_status" in ('reported', 'under_review', 'assessed', 'closed')),
	CONSTRAINT "damage_files_repair_check" CHECK ("damage_files"."repair_status" in ('not_needed', 'pending', 'in_repair', 'repaired')),
	CONSTRAINT "damage_files_texts_check" CHECK (char_length("damage_files"."description") between 5 and 2000 and coalesce(char_length("damage_files"."area"), 0) <= 120 and coalesce(char_length("damage_files"."location_text"), 0) <= 200 and coalesce(char_length("damage_files"."assessment_note"), 0) <= 2000),
	CONSTRAINT "damage_files_source_check" CHECK (("damage_files"."source_mark_id" is null or "damage_files"."inspection_id" is not null) and ("damage_files"."inspection_id" is null or "damage_files"."rental_id" is not null)),
	CONSTRAINT "damage_files_closed_check" CHECK (("damage_files"."review_status" = 'closed') = ("damage_files"."closed_at" is not null) and ("damage_files"."closed_at" is null or char_length("damage_files"."close_reason") between 5 and 300)),
	CONSTRAINT "damage_files_version_check" CHECK ("damage_files"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "damage_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"damage_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "damage_photos_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "damage_photos_file_key" UNIQUE("company_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"maintenance_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"data" jsonb,
	"client_request_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_events_kind_check" CHECK ("maintenance_events"."kind" in ('created', 'updated', 'approved', 'started', 'work_done', 'completed', 'cancelled', 'photo_added', 'photo_removed'))
);
--> statement-breakpoint
CREATE TABLE "maintenance_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"maintenance_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "maintenance_photos_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "maintenance_photos_file_key" UNIQUE("company_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"maintenance_no" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"actual_start_at" timestamp with time zone,
	"work_done_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"start_km" integer,
	"end_km" integer,
	"start_odometer_reading_id" uuid,
	"end_odometer_reading_id" uuid,
	"start_location_event_id" uuid,
	"end_location_event_id" uuid,
	"at_provider" boolean DEFAULT false NOT NULL,
	"provider_name" text,
	"work_done" text,
	"parts" text,
	"notes" text,
	"damage_file_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"started_by" uuid,
	"work_done_by" uuid,
	"completed_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "maintenance_records_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "maintenance_records_company_no_key" UNIQUE("company_id","maintenance_no"),
	CONSTRAINT "maintenance_records_no_check" CHECK ("maintenance_records"."maintenance_no" ~ '^B-[0-9]{6,}$'),
	CONSTRAINT "maintenance_records_type_check" CHECK ("maintenance_records"."type" in ('periodic', 'repair', 'tire', 'inspection', 'other')),
	CONSTRAINT "maintenance_records_status_check" CHECK ("maintenance_records"."status" in ('pending_approval', 'planned', 'in_service', 'awaiting_check', 'completed', 'cancelled')),
	CONSTRAINT "maintenance_records_plan_check" CHECK ("maintenance_records"."planned_end_at" > "maintenance_records"."planned_start_at" and "maintenance_records"."planned_end_at" - "maintenance_records"."planned_start_at" <= interval '180 days'),
	CONSTRAINT "maintenance_records_reason_check" CHECK (char_length("maintenance_records"."reason") between 3 and 500),
	CONSTRAINT "maintenance_records_texts_check" CHECK (coalesce(char_length("maintenance_records"."work_done"), 0) <= 2000 and coalesce(char_length("maintenance_records"."parts"), 0) <= 2000 and coalesce(char_length("maintenance_records"."notes"), 0) <= 2000 and coalesce(char_length("maintenance_records"."provider_name"), 0) <= 120),
	CONSTRAINT "maintenance_records_provider_check" CHECK (not "maintenance_records"."at_provider" or coalesce(btrim("maintenance_records"."provider_name"), '') <> ''),
	CONSTRAINT "maintenance_records_km_check" CHECK (("maintenance_records"."start_km" is null or "maintenance_records"."start_km" between 0 and 3000000) and ("maintenance_records"."end_km" is null or "maintenance_records"."end_km" between 0 and 3000000) and ("maintenance_records"."start_km" is null or "maintenance_records"."end_km" is null or "maintenance_records"."end_km" >= "maintenance_records"."start_km")),
	CONSTRAINT "maintenance_records_started_check" CHECK ("maintenance_records"."status" in ('pending_approval', 'planned', 'cancelled') or ("maintenance_records"."actual_start_at" is not null and "maintenance_records"."started_by" is not null)),
	CONSTRAINT "maintenance_records_work_done_check" CHECK ("maintenance_records"."status" not in ('awaiting_check', 'completed') or ("maintenance_records"."work_done_at" is not null and "maintenance_records"."work_done_at" >= "maintenance_records"."actual_start_at")),
	CONSTRAINT "maintenance_records_completed_check" CHECK ("maintenance_records"."status" <> 'completed' or ("maintenance_records"."completed_at" is not null and "maintenance_records"."completed_at" >= "maintenance_records"."work_done_at" and "maintenance_records"."end_km" is not null and "maintenance_records"."end_odometer_reading_id" is not null and "maintenance_records"."completed_by" is not null)),
	CONSTRAINT "maintenance_records_cancel_check" CHECK (("maintenance_records"."status" = 'cancelled') = ("maintenance_records"."cancelled_at" is not null) and ("maintenance_records"."cancelled_at" is null or char_length("maintenance_records"."cancel_reason") between 5 and 300)),
	CONSTRAINT "maintenance_records_version_check" CHECK ("maintenance_records"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"interval_km" integer,
	"interval_months" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "maintenance_schedules_company_id_vehicle_id_pk" PRIMARY KEY("company_id","vehicle_id"),
	CONSTRAINT "maintenance_schedules_interval_check" CHECK (("maintenance_schedules"."interval_km" is not null or "maintenance_schedules"."interval_months" is not null) and ("maintenance_schedules"."interval_km" is null or "maintenance_schedules"."interval_km" between 500 and 200000) and ("maintenance_schedules"."interval_months" is null or "maintenance_schedules"."interval_months" between 1 and 60))
);
--> statement-breakpoint
CREATE TABLE "transfer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"data" jsonb,
	"client_request_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_events_kind_check" CHECK ("transfer_events"."kind" in ('created', 'updated', 'approved', 'departed', 'received', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "vehicle_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transfer_no" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"planned_departure_at" timestamp with time zone NOT NULL,
	"planned_arrival_at" timestamp with time zone NOT NULL,
	"from_timezone" text NOT NULL,
	"to_timezone" text NOT NULL,
	"driver_note" text,
	"departed_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"departure_km" integer,
	"arrival_km" integer,
	"departure_fuel" text,
	"arrival_fuel" text,
	"departure_odometer_reading_id" uuid,
	"arrival_odometer_reading_id" uuid,
	"departure_location_event_id" uuid,
	"arrival_location_event_id" uuid,
	"departure_note" text,
	"arrival_note" text,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"departed_by" uuid,
	"received_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"client_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "vehicle_transfers_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "vehicle_transfers_company_no_key" UNIQUE("company_id","transfer_no"),
	CONSTRAINT "vehicle_transfers_no_check" CHECK ("vehicle_transfers"."transfer_no" ~ '^T-[0-9]{6,}$'),
	CONSTRAINT "vehicle_transfers_status_check" CHECK ("vehicle_transfers"."status" in ('requested', 'approved', 'in_transit', 'completed', 'cancelled')),
	CONSTRAINT "vehicle_transfers_branches_check" CHECK ("vehicle_transfers"."from_branch_id" <> "vehicle_transfers"."to_branch_id"),
	CONSTRAINT "vehicle_transfers_plan_check" CHECK ("vehicle_transfers"."planned_arrival_at" > "vehicle_transfers"."planned_departure_at" and "vehicle_transfers"."planned_arrival_at" - "vehicle_transfers"."planned_departure_at" <= interval '30 days'),
	CONSTRAINT "vehicle_transfers_reason_check" CHECK (char_length("vehicle_transfers"."reason") between 3 and 500),
	CONSTRAINT "vehicle_transfers_texts_check" CHECK (coalesce(char_length("vehicle_transfers"."driver_note"), 0) <= 300 and coalesce(char_length("vehicle_transfers"."departure_note"), 0) <= 1000 and coalesce(char_length("vehicle_transfers"."arrival_note"), 0) <= 1000),
	CONSTRAINT "vehicle_transfers_fuel_check" CHECK (("vehicle_transfers"."departure_fuel" is null or "vehicle_transfers"."departure_fuel" in ('empty', 'quarter', 'half', 'three_quarters', 'full')) and ("vehicle_transfers"."arrival_fuel" is null or "vehicle_transfers"."arrival_fuel" in ('empty', 'quarter', 'half', 'three_quarters', 'full'))),
	CONSTRAINT "vehicle_transfers_km_check" CHECK (("vehicle_transfers"."departure_km" is null or "vehicle_transfers"."departure_km" between 0 and 3000000) and ("vehicle_transfers"."arrival_km" is null or "vehicle_transfers"."arrival_km" between 0 and 3000000) and ("vehicle_transfers"."arrival_km" is null or "vehicle_transfers"."arrival_km" >= "vehicle_transfers"."departure_km")),
	CONSTRAINT "vehicle_transfers_approved_check" CHECK ("vehicle_transfers"."status" in ('requested', 'cancelled') or ("vehicle_transfers"."approved_at" is not null and "vehicle_transfers"."approved_by" is not null)),
	CONSTRAINT "vehicle_transfers_departed_check" CHECK ("vehicle_transfers"."status" not in ('in_transit', 'completed') or ("vehicle_transfers"."departed_at" is not null and "vehicle_transfers"."departed_by" is not null and "vehicle_transfers"."departure_km" is not null and "vehicle_transfers"."departure_fuel" is not null and "vehicle_transfers"."departure_odometer_reading_id" is not null and "vehicle_transfers"."departure_location_event_id" is not null)),
	CONSTRAINT "vehicle_transfers_completed_check" CHECK ("vehicle_transfers"."status" <> 'completed' or ("vehicle_transfers"."arrived_at" is not null and "vehicle_transfers"."arrived_at" >= "vehicle_transfers"."departed_at" and "vehicle_transfers"."received_by" is not null and "vehicle_transfers"."arrival_km" is not null and "vehicle_transfers"."arrival_fuel" is not null and "vehicle_transfers"."arrival_odometer_reading_id" is not null and "vehicle_transfers"."arrival_location_event_id" is not null)),
	CONSTRAINT "vehicle_transfers_cancel_check" CHECK (("vehicle_transfers"."status" = 'cancelled') = ("vehicle_transfers"."cancelled_at" is not null) and ("vehicle_transfers"."cancelled_at" is null or char_length("vehicle_transfers"."cancel_reason") between 5 and 300)),
	CONSTRAINT "vehicle_transfers_version_check" CHECK ("vehicle_transfers"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "company_sequences" DROP CONSTRAINT "company_sequences_kind_check";--> statement-breakpoint
ALTER TABLE "damage_blocks" ADD CONSTRAINT "damage_blocks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_blocks" ADD CONSTRAINT "damage_blocks_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_blocks" ADD CONSTRAINT "damage_blocks_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_blocks" ADD CONSTRAINT "damage_blocks_company_id_damage_id_damage_files_company_id_id_fk" FOREIGN KEY ("company_id","damage_id") REFERENCES "public"."damage_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_blocks" ADD CONSTRAINT "damage_blocks_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_events" ADD CONSTRAINT "damage_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_events" ADD CONSTRAINT "damage_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_events" ADD CONSTRAINT "damage_events_company_id_damage_id_damage_files_company_id_id_fk" FOREIGN KEY ("company_id","damage_id") REFERENCES "public"."damage_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_company_id_inspection_id_rental_inspections_company_id_id_fk" FOREIGN KEY ("company_id","inspection_id") REFERENCES "public"."rental_inspections"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_files" ADD CONSTRAINT "damage_files_company_id_source_mark_id_rental_damage_marks_company_id_id_fk" FOREIGN KEY ("company_id","source_mark_id") REFERENCES "public"."rental_damage_marks"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_company_id_damage_id_damage_files_company_id_id_fk" FOREIGN KEY ("company_id","damage_id") REFERENCES "public"."damage_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_company_id_file_id_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_company_id_maintenance_id_maintenance_records_company_id_id_fk" FOREIGN KEY ("company_id","maintenance_id") REFERENCES "public"."maintenance_records"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_company_id_maintenance_id_maintenance_records_company_id_id_fk" FOREIGN KEY ("company_id","maintenance_id") REFERENCES "public"."maintenance_records"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_company_id_file_id_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_work_done_by_users_id_fk" FOREIGN KEY ("work_done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_start_odometer_reading_id_odometer_readings_company_id_id_fk" FOREIGN KEY ("company_id","start_odometer_reading_id") REFERENCES "public"."odometer_readings"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_end_odometer_reading_id_odometer_readings_company_id_id_fk" FOREIGN KEY ("company_id","end_odometer_reading_id") REFERENCES "public"."odometer_readings"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_start_location_event_id_vehicle_location_events_company_id_id_fk" FOREIGN KEY ("company_id","start_location_event_id") REFERENCES "public"."vehicle_location_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_end_location_event_id_vehicle_location_events_company_id_id_fk" FOREIGN KEY ("company_id","end_location_event_id") REFERENCES "public"."vehicle_location_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_company_id_damage_file_id_damage_files_company_id_id_fk" FOREIGN KEY ("company_id","damage_file_id") REFERENCES "public"."damage_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_company_id_transfer_id_vehicle_transfers_company_id_id_fk" FOREIGN KEY ("company_id","transfer_id") REFERENCES "public"."vehicle_transfers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_departed_by_users_id_fk" FOREIGN KEY ("departed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_from_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","from_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_to_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","to_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_departure_odometer_reading_id_odometer_readings_company_id_id_fk" FOREIGN KEY ("company_id","departure_odometer_reading_id") REFERENCES "public"."odometer_readings"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_arrival_odometer_reading_id_odometer_readings_company_id_id_fk" FOREIGN KEY ("company_id","arrival_odometer_reading_id") REFERENCES "public"."odometer_readings"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_departure_location_event_id_vehicle_location_events_company_id_id_fk" FOREIGN KEY ("company_id","departure_location_event_id") REFERENCES "public"."vehicle_location_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_arrival_location_event_id_vehicle_location_events_company_id_id_fk" FOREIGN KEY ("company_id","arrival_location_event_id") REFERENCES "public"."vehicle_location_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "damage_blocks_open_key" ON "damage_blocks" USING btree ("company_id","damage_id") WHERE "damage_blocks"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "damage_blocks_vehicle_idx" ON "damage_blocks" USING btree ("company_id","vehicle_id","started_at");--> statement-breakpoint
CREATE INDEX "damage_events_file_idx" ON "damage_events" USING btree ("company_id","damage_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "damage_events_request_key" ON "damage_events" USING btree ("company_id","client_request_id") WHERE "damage_events"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "damage_files_request_key" ON "damage_files" USING btree ("company_id","client_request_id") WHERE "damage_files"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "damage_files_source_mark_key" ON "damage_files" USING btree ("company_id","source_mark_id") WHERE "damage_files"."source_mark_id" is not null;--> statement-breakpoint
CREATE INDEX "damage_files_vehicle_idx" ON "damage_files" USING btree ("company_id","vehicle_id","detected_at");--> statement-breakpoint
CREATE INDEX "damage_files_status_idx" ON "damage_files" USING btree ("company_id","review_status","detected_at");--> statement-breakpoint
CREATE INDEX "damage_files_rental_idx" ON "damage_files" USING btree ("company_id","rental_id");--> statement-breakpoint
CREATE INDEX "damage_photos_damage_idx" ON "damage_photos" USING btree ("company_id","damage_id");--> statement-breakpoint
CREATE INDEX "maintenance_events_record_idx" ON "maintenance_events" USING btree ("company_id","maintenance_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_events_request_key" ON "maintenance_events" USING btree ("company_id","client_request_id") WHERE "maintenance_events"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "maintenance_photos_record_idx" ON "maintenance_photos" USING btree ("company_id","maintenance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_records_request_key" ON "maintenance_records" USING btree ("company_id","client_request_id") WHERE "maintenance_records"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "maintenance_records_vehicle_idx" ON "maintenance_records" USING btree ("company_id","vehicle_id","planned_start_at");--> statement-breakpoint
CREATE INDEX "maintenance_records_status_idx" ON "maintenance_records" USING btree ("company_id","status","planned_start_at");--> statement-breakpoint
CREATE INDEX "maintenance_records_branch_idx" ON "maintenance_records" USING btree ("company_id","branch_id");--> statement-breakpoint
CREATE INDEX "transfer_events_transfer_idx" ON "transfer_events" USING btree ("company_id","transfer_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_events_request_key" ON "transfer_events" USING btree ("company_id","client_request_id") WHERE "transfer_events"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_transfers_request_key" ON "vehicle_transfers" USING btree ("company_id","client_request_id") WHERE "vehicle_transfers"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "vehicle_transfers_vehicle_idx" ON "vehicle_transfers" USING btree ("company_id","vehicle_id","planned_departure_at");--> statement-breakpoint
CREATE INDEX "vehicle_transfers_status_idx" ON "vehicle_transfers" USING btree ("company_id","status","planned_departure_at");--> statement-breakpoint
CREATE INDEX "vehicle_transfers_from_idx" ON "vehicle_transfers" USING btree ("company_id","from_branch_id");--> statement-breakpoint
CREATE INDEX "vehicle_transfers_to_idx" ON "vehicle_transfers" USING btree ("company_id","to_branch_id");--> statement-breakpoint
ALTER TABLE "company_sequences" ADD CONSTRAINT "company_sequences_kind_check" CHECK ("company_sequences"."kind" in ('customer', 'corporate_account', 'reservation', 'rental', 'price_quote', 'contract', 'finance_charge', 'finance_payment', 'finance_deposit', 'finance_refund', 'maintenance', 'damage', 'transfer'));