CREATE TABLE "rental_damage_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"view" text NOT NULL,
	"x_permille" integer NOT NULL,
	"y_permille" integer NOT NULL,
	"category" text NOT NULL,
	"note" text,
	"photo_id" uuid,
	"existing_mark_id" uuid,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "rental_damage_marks_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "rental_damage_marks_view_check" CHECK ("rental_damage_marks"."view" in ('front', 'rear', 'left', 'right', 'top')),
	CONSTRAINT "rental_damage_marks_position_check" CHECK ("rental_damage_marks"."x_permille" between 0 and 1000 and "rental_damage_marks"."y_permille" between 0 and 1000),
	CONSTRAINT "rental_damage_marks_category_check" CHECK ("rental_damage_marks"."category" in ('scratch', 'dent', 'crack', 'stain', 'missing_part', 'other')),
	CONSTRAINT "rental_damage_marks_note_check" CHECK ("rental_damage_marks"."note" is null or char_length("rental_damage_marks"."note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "rental_document_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"driver_role" text NOT NULL,
	"residency_class" text NOT NULL,
	"reference_country" text,
	"rule_status" text NOT NULL,
	"policy_id" uuid,
	"policy_version" integer,
	"required_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"checked_by" uuid,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_document_checks_country_check" CHECK ("rental_document_checks"."reference_country" is null or "rental_document_checks"."reference_country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "rental_document_checks_rule_check" CHECK (("rental_document_checks"."rule_status" = 'policy_applied') = ("rental_document_checks"."policy_id" is not null and "rental_document_checks"."policy_version" is not null)),
	CONSTRAINT "rental_document_checks_country_rule_check" CHECK (("rental_document_checks"."rule_status" = 'branch_country_missing') = ("rental_document_checks"."reference_country" is null)),
	CONSTRAINT "rental_document_checks_note_check" CHECK ("rental_document_checks"."note" is null or char_length("rental_document_checks"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "rental_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rental_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"data" jsonb,
	"client_request_id" uuid,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_events_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "rental_events_kind_check" CHECK ("rental_events"."kind" in ('created', 'updated', 'document_check', 'delivered', 'extended', 'returned', 'closed', 'cancelled')),
	CONSTRAINT "rental_events_to_check" CHECK ("rental_events"."to_status" in ('prepared', 'delivered', 'returned', 'closed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "rental_inspection_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"angle" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "rental_inspection_photos_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "rental_inspection_photos_file_key" UNIQUE("file_id"),
	CONSTRAINT "rental_inspection_photos_angle_check" CHECK ("rental_inspection_photos"."angle" in ('front', 'rear', 'left', 'right', 'interior', 'other'))
);
--> statement-breakpoint
CREATE TABLE "rental_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"km" integer,
	"fuel" text,
	"cleanliness" text,
	"condition" text,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"counterpart_customer_id" uuid,
	"occurred_at" timestamp with time zone,
	"branch_id" uuid,
	"performed_by" uuid,
	"odometer_reading_id" uuid,
	"location_event_id" uuid,
	"findings_acknowledged_at" timestamp with time zone,
	"findings_acknowledged_by" uuid,
	"finalized_at" timestamp with time zone,
	"finalized_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "rental_inspections_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "rental_inspections_kind_key" UNIQUE("company_id","rental_id","kind"),
	CONSTRAINT "rental_inspections_kind_check" CHECK ("rental_inspections"."kind" in ('handover', 'return')),
	CONSTRAINT "rental_inspections_state_check" CHECK ("rental_inspections"."state" in ('draft', 'final')),
	CONSTRAINT "rental_inspections_km_check" CHECK ("rental_inspections"."km" is null or "rental_inspections"."km" between 0 and 3000000),
	CONSTRAINT "rental_inspections_fuel_check" CHECK ("rental_inspections"."fuel" is null or "rental_inspections"."fuel" in ('empty', 'quarter', 'half', 'three_quarters', 'full')),
	CONSTRAINT "rental_inspections_cleanliness_check" CHECK ("rental_inspections"."cleanliness" is null or "rental_inspections"."cleanliness" in ('clean', 'acceptable', 'dirty')),
	CONSTRAINT "rental_inspections_condition_check" CHECK ("rental_inspections"."condition" is null or "rental_inspections"."condition" in ('good', 'minor_issues', 'needs_attention')),
	CONSTRAINT "rental_inspections_notes_check" CHECK ("rental_inspections"."notes" is null or char_length("rental_inspections"."notes") <= 2000),
	CONSTRAINT "rental_inspections_final_check" CHECK ("rental_inspections"."state" = 'draft' or ("rental_inspections"."finalized_at" is not null and "rental_inspections"."km" is not null and "rental_inspections"."fuel" is not null and "rental_inspections"."occurred_at" is not null and "rental_inspections"."branch_id" is not null and "rental_inspections"."performed_by" is not null)),
	CONSTRAINT "rental_inspections_version_check" CHECK ("rental_inspections"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rental_no" text NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"origin" text NOT NULL,
	"reservation_id" uuid,
	"customer_id" uuid NOT NULL,
	"corporate_account_id" uuid,
	"vehicle_class_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"pickup_branch_id" uuid NOT NULL,
	"return_branch_id" uuid NOT NULL,
	"planned_pickup_at" timestamp with time zone NOT NULL,
	"planned_return_at" timestamp with time zone NOT NULL,
	"pickup_timezone" text NOT NULL,
	"return_timezone" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivered_by" uuid,
	"external_terms_ack_at" timestamp with time zone,
	"external_terms_ack_by" uuid,
	"returned_at" timestamp with time zone,
	"returned_by" uuid,
	"actual_return_branch_id" uuid,
	"actual_return_timezone" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"cancel_reason" text,
	"cancel_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"note" text,
	"client_request_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "rentals_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "rentals_company_no_key" UNIQUE("company_id","rental_no"),
	CONSTRAINT "rentals_no_check" CHECK ("rentals"."rental_no" ~ '^K-[0-9]{6,}$'),
	CONSTRAINT "rentals_status_check" CHECK ("rentals"."status" in ('prepared', 'delivered', 'returned', 'closed', 'cancelled')),
	CONSTRAINT "rentals_origin_check" CHECK (("rentals"."origin" = 'reservation') = ("rentals"."reservation_id" is not null)),
	CONSTRAINT "rentals_period_check" CHECK ("rentals"."planned_return_at" > "rentals"."planned_pickup_at"),
	CONSTRAINT "rentals_delivered_check" CHECK (("rentals"."status" in ('delivered', 'returned', 'closed')) = ("rentals"."delivered_at" is not null and "rentals"."delivered_by" is not null)),
	CONSTRAINT "rentals_returned_check" CHECK (("rentals"."status" in ('returned', 'closed')) = ("rentals"."returned_at" is not null and "rentals"."actual_return_branch_id" is not null and "rentals"."actual_return_timezone" is not null)),
	CONSTRAINT "rentals_return_after_delivery_check" CHECK ("rentals"."returned_at" is null or "rentals"."returned_at" > "rentals"."delivered_at"),
	CONSTRAINT "rentals_closed_check" CHECK (("rentals"."status" = 'closed') = ("rentals"."closed_at" is not null)),
	CONSTRAINT "rentals_cancel_check" CHECK (("rentals"."status" = 'cancelled') = ("rentals"."cancelled_at" is not null and "rentals"."cancel_reason" is not null)),
	CONSTRAINT "rentals_cancel_reason_check" CHECK ("rentals"."cancel_reason" is null or "rentals"."cancel_reason" in ('customer_request', 'vehicle_problem', 'documents_missing', 'entry_error', 'other')),
	CONSTRAINT "rentals_version_check" CHECK ("rentals"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "company_sequences" DROP CONSTRAINT "company_sequences_kind_check";--> statement-breakpoint
ALTER TABLE "rental_damage_marks" ADD CONSTRAINT "rental_damage_marks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_damage_marks" ADD CONSTRAINT "rental_damage_marks_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_damage_marks" ADD CONSTRAINT "rental_damage_marks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_damage_marks" ADD CONSTRAINT "rental_damage_marks_company_id_inspection_id_rental_inspections_company_id_id_fk" FOREIGN KEY ("company_id","inspection_id") REFERENCES "public"."rental_inspections"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_damage_marks" ADD CONSTRAINT "rental_damage_marks_company_id_photo_id_rental_inspection_photos_company_id_id_fk" FOREIGN KEY ("company_id","photo_id") REFERENCES "public"."rental_inspection_photos"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_damage_marks" ADD CONSTRAINT "rental_damage_marks_company_id_existing_mark_id_rental_damage_marks_company_id_id_fk" FOREIGN KEY ("company_id","existing_mark_id") REFERENCES "public"."rental_damage_marks"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_document_checks" ADD CONSTRAINT "rental_document_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_document_checks" ADD CONSTRAINT "rental_document_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_document_checks" ADD CONSTRAINT "rental_document_checks_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_document_checks" ADD CONSTRAINT "rental_document_checks_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_document_checks" ADD CONSTRAINT "rental_document_checks_company_id_policy_id_document_requirement_policies_company_id_id_fk" FOREIGN KEY ("company_id","policy_id") REFERENCES "public"."document_requirement_policies"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_drivers" ADD CONSTRAINT "rental_drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_drivers" ADD CONSTRAINT "rental_drivers_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_drivers" ADD CONSTRAINT "rental_drivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_drivers" ADD CONSTRAINT "rental_drivers_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_drivers" ADD CONSTRAINT "rental_drivers_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_events" ADD CONSTRAINT "rental_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_events" ADD CONSTRAINT "rental_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_events" ADD CONSTRAINT "rental_events_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspection_photos" ADD CONSTRAINT "rental_inspection_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspection_photos" ADD CONSTRAINT "rental_inspection_photos_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspection_photos" ADD CONSTRAINT "rental_inspection_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspection_photos" ADD CONSTRAINT "rental_inspection_photos_company_id_inspection_id_rental_inspections_company_id_id_fk" FOREIGN KEY ("company_id","inspection_id") REFERENCES "public"."rental_inspections"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspection_photos" ADD CONSTRAINT "rental_inspection_photos_company_id_file_id_files_company_id_id_fk" FOREIGN KEY ("company_id","file_id") REFERENCES "public"."files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_findings_acknowledged_by_users_id_fk" FOREIGN KEY ("findings_acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_rental_id_rentals_company_id_id_fk" FOREIGN KEY ("company_id","rental_id") REFERENCES "public"."rentals"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_counterpart_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","counterpart_customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_odometer_reading_id_odometer_readings_company_id_id_fk" FOREIGN KEY ("company_id","odometer_reading_id") REFERENCES "public"."odometer_readings"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_company_id_location_event_id_vehicle_location_events_company_id_id_fk" FOREIGN KEY ("company_id","location_event_id") REFERENCES "public"."vehicle_location_events"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_external_terms_ack_by_users_id_fk" FOREIGN KEY ("external_terms_ack_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_reservation_id_reservations_company_id_id_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "public"."reservations"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_corporate_account_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","corporate_account_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_vehicle_class_id_vehicle_classes_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_class_id") REFERENCES "public"."vehicle_classes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_pickup_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","pickup_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_return_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","return_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_company_id_actual_return_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","actual_return_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_damage_marks_inspection_idx" ON "rental_damage_marks" USING btree ("company_id","inspection_id");--> statement-breakpoint
CREATE INDEX "rental_document_checks_rental_idx" ON "rental_document_checks" USING btree ("company_id","rental_id","checked_at");--> statement-breakpoint
CREATE INDEX "rental_drivers_rental_idx" ON "rental_drivers" USING btree ("company_id","rental_id");--> statement-breakpoint
CREATE INDEX "rental_drivers_customer_idx" ON "rental_drivers" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_drivers_active_key" ON "rental_drivers" USING btree ("company_id","rental_id","customer_id") WHERE "rental_drivers"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_drivers_primary_key" ON "rental_drivers" USING btree ("company_id","rental_id") WHERE "rental_drivers"."is_primary" and "rental_drivers"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "rental_events_rental_idx" ON "rental_events" USING btree ("company_id","rental_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_events_request_key" ON "rental_events" USING btree ("company_id","client_request_id") WHERE "rental_events"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "rental_inspection_photos_inspection_idx" ON "rental_inspection_photos" USING btree ("company_id","inspection_id");--> statement-breakpoint
CREATE INDEX "rental_inspections_vehicle_idx" ON "rental_inspections" USING btree ("company_id","vehicle_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_reservation_key" ON "rentals" USING btree ("company_id","reservation_id") WHERE "rentals"."reservation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_request_key" ON "rentals" USING btree ("company_id","client_request_id") WHERE "rentals"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "rentals_company_status_pickup_idx" ON "rentals" USING btree ("company_id","status","planned_pickup_at");--> statement-breakpoint
CREATE INDEX "rentals_company_pickup_idx" ON "rentals" USING btree ("company_id","planned_pickup_at");--> statement-breakpoint
CREATE INDEX "rentals_company_return_idx" ON "rentals" USING btree ("company_id","planned_return_at");--> statement-breakpoint
CREATE INDEX "rentals_company_vehicle_idx" ON "rentals" USING btree ("company_id","vehicle_id","planned_pickup_at");--> statement-breakpoint
CREATE INDEX "rentals_company_customer_idx" ON "rentals" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "rentals_company_account_idx" ON "rentals" USING btree ("company_id","corporate_account_id");--> statement-breakpoint
CREATE INDEX "rentals_company_created_idx" ON "rentals" USING btree ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "company_sequences" ADD CONSTRAINT "company_sequences_kind_check" CHECK ("company_sequences"."kind" in ('customer', 'corporate_account', 'reservation', 'rental'));