ALTER TABLE "vehicle_transfers" ADD COLUMN "purpose" text DEFAULT 'operational' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD COLUMN "damage_file_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD COLUMN "transport_method" text;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD COLUMN "transport_ack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD COLUMN "transport_ack_by" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_transport_ack_by_users_id_fk" FOREIGN KEY ("transport_ack_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_company_id_damage_file_id_damage_files_company_id_id_fk" FOREIGN KEY ("company_id","damage_file_id") REFERENCES "public"."damage_files"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_transfers_damage_idx" ON "vehicle_transfers" USING btree ("company_id","damage_file_id");--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_purpose_check" CHECK (("vehicle_transfers"."purpose" = 'operational' and "vehicle_transfers"."damage_file_id" is null and "vehicle_transfers"."transport_method" is null and "vehicle_transfers"."transport_ack_at" is null)
        or ("vehicle_transfers"."purpose" = 'repair' and "vehicle_transfers"."damage_file_id" is not null and "vehicle_transfers"."transport_method" in ('tow_truck', 'car_carrier')));--> statement-breakpoint
ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_transport_ack_check" CHECK (("vehicle_transfers"."transport_ack_at" is null) = ("vehicle_transfers"."transport_ack_by" is null));