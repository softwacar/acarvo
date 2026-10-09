-- Vehicles module: company isolation, allowed values, and runtime privileges.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_classes', 'vehicles', 'odometer_readings', 'vehicle_location_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE vehicles ADD CONSTRAINT vehicles_fuel_type_check CHECK (fuel_type IN ('petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'lpg'));
--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicles_transmission_check CHECK (transmission IN ('manual', 'automatic'));
--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicles_source_check CHECK (source IN ('internal', 'external'));
--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_check CHECK (status IN ('active', 'out_of_service', 'sold', 'disposed'));
--> statement-breakpoint
-- Sold / Disposed are internal-fleet lifecycle states only (spec §59BM, §59X).
ALTER TABLE vehicles ADD CONSTRAINT vehicles_external_status_check CHECK (source = 'internal' OR status IN ('active', 'out_of_service'));
--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicles_acquisition_type_check CHECK (acquisition_type IS NULL OR acquisition_type IN ('purchase', 'lease', 'long_term_rent', 'other'));
--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicles_plate_normalized_check CHECK (plate_normalized ~ '^[A-Z0-9ČĆŽŠĐÇĞİÖŞÜ]{2,15}$');
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_event_type_check CHECK (event_type IN ('initial', 'correction'));
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_type_check CHECK (location_type IN ('branch', 'in_transit', 'with_customer', 'service_provider', 'supplier'));
--> statement-breakpoint

-- Runtime privileges. Vehicles are never hard-deleted; odometer and location histories are append-only.
GRANT SELECT, INSERT, UPDATE ON vehicle_classes, vehicles TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON odometer_readings, vehicle_location_events TO acarvo_app;
