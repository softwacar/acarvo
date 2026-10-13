CREATE TABLE "reservation_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "reservation_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"note" text,
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_status_events_to_check" CHECK ("reservation_status_events"."to_status" in ('pending', 'confirmed', 'converted', 'cancelled', 'no_show'))
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"reservation_no" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"corporate_account_id" uuid,
	"booker_customer_id" uuid,
	"vehicle_class_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"pickup_branch_id" uuid NOT NULL,
	"return_branch_id" uuid NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"pickup_timezone" text NOT NULL,
	"return_timezone" text NOT NULL,
	"note" text,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"cancel_reason" text,
	"cancel_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"no_show_reason" text,
	"no_show_note" text,
	"no_show_at" timestamp with time zone,
	"no_show_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "reservations_company_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "reservations_company_no_key" UNIQUE("company_id","reservation_no"),
	CONSTRAINT "reservations_no_check" CHECK ("reservations"."reservation_no" ~ '^R-[0-9]{6,}$'),
	CONSTRAINT "reservations_status_check" CHECK ("reservations"."status" in ('pending', 'confirmed', 'converted', 'cancelled', 'no_show')),
	CONSTRAINT "reservations_source_check" CHECK ("reservations"."source" in ('direct_walk_in', 'phone', 'website', 'partner', 'corporate', 'returning_customer', 'other')),
	CONSTRAINT "reservations_period_check" CHECK ("reservations"."return_at" > "reservations"."pickup_at"),
	CONSTRAINT "reservations_confirmed_vehicle_check" CHECK ("reservations"."status" <> 'confirmed' or "reservations"."vehicle_id" is not null),
	CONSTRAINT "reservations_cancel_check" CHECK (("reservations"."status" = 'cancelled') = ("reservations"."cancelled_at" is not null and "reservations"."cancel_reason" is not null)),
	CONSTRAINT "reservations_cancel_reason_check" CHECK ("reservations"."cancel_reason" is null or "reservations"."cancel_reason" in ('customer_request', 'no_vehicle', 'duplicate', 'entry_error', 'other')),
	CONSTRAINT "reservations_no_show_check" CHECK (("reservations"."status" = 'no_show') = ("reservations"."no_show_at" is not null and "reservations"."no_show_reason" is not null)),
	CONSTRAINT "reservations_no_show_reason_check" CHECK ("reservations"."no_show_reason" is null or "reservations"."no_show_reason" in ('did_not_arrive', 'unreachable', 'arrived_without_requirements', 'other')),
	CONSTRAINT "reservations_version_check" CHECK ("reservations"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "company_sequences" DROP CONSTRAINT "company_sequences_kind_check";--> statement-breakpoint
ALTER TABLE "reservation_drivers" ADD CONSTRAINT "reservation_drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_drivers" ADD CONSTRAINT "reservation_drivers_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_drivers" ADD CONSTRAINT "reservation_drivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_drivers" ADD CONSTRAINT "reservation_drivers_company_id_reservation_id_reservations_company_id_id_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "public"."reservations"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_drivers" ADD CONSTRAINT "reservation_drivers_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_events" ADD CONSTRAINT "reservation_status_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_events" ADD CONSTRAINT "reservation_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_events" ADD CONSTRAINT "reservation_status_events_company_id_reservation_id_reservations_company_id_id_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "public"."reservations"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_show_by_users_id_fk" FOREIGN KEY ("no_show_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_booker_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","booker_customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_corporate_account_id_corporate_accounts_company_id_id_fk" FOREIGN KEY ("company_id","corporate_account_id") REFERENCES "public"."corporate_accounts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_vehicle_class_id_vehicle_classes_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_class_id") REFERENCES "public"."vehicle_classes"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_vehicle_id_vehicles_company_id_id_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."vehicles"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_pickup_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","pickup_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_return_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","return_branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_drivers_reservation_idx" ON "reservation_drivers" USING btree ("company_id","reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_drivers_customer_idx" ON "reservation_drivers" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_drivers_active_key" ON "reservation_drivers" USING btree ("company_id","reservation_id","customer_id") WHERE "reservation_drivers"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_drivers_primary_key" ON "reservation_drivers" USING btree ("company_id","reservation_id") WHERE "reservation_drivers"."is_primary" and "reservation_drivers"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "reservation_status_events_reservation_idx" ON "reservation_status_events" USING btree ("company_id","reservation_id","at");--> statement-breakpoint
CREATE INDEX "reservations_company_pickup_idx" ON "reservations" USING btree ("company_id","pickup_at");--> statement-breakpoint
CREATE INDEX "reservations_company_status_pickup_idx" ON "reservations" USING btree ("company_id","status","pickup_at");--> statement-breakpoint
CREATE INDEX "reservations_company_vehicle_idx" ON "reservations" USING btree ("company_id","vehicle_id","pickup_at");--> statement-breakpoint
CREATE INDEX "reservations_company_customer_idx" ON "reservations" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "reservations_company_account_idx" ON "reservations" USING btree ("company_id","corporate_account_id");--> statement-breakpoint
CREATE INDEX "reservations_company_created_idx" ON "reservations" USING btree ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "company_sequences" ADD CONSTRAINT "company_sequences_kind_check" CHECK ("company_sequences"."kind" in ('customer', 'corporate_account', 'reservation'));