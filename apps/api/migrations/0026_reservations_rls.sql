-- Reservations V1: company isolation, lifecycle and double-booking guards, runtime privileges.
-- Additive only: no existing table or row is changed (docs/REZERVASYON_YONETIMI_PLANI.md §3).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reservations', 'reservation_drivers', 'reservation_status_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Identity stays; only the lifecycle of spec §9.3 is possible; cancelled, no-show and converted are final.
CREATE OR REPLACE FUNCTION reservations_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'a reservation starts as pending or confirmed' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_lifecycle';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.reservation_no <> OLD.reservation_no
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'reservation identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_immutable';
  END IF;
  IF OLD.status IN ('cancelled', 'no_show', 'converted') THEN
    RAISE EXCEPTION 'a % reservation cannot change', OLD.status USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_final';
  END IF;
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
          OR (OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'no_show', 'converted'))) THEN
    RAISE EXCEPTION 'reservation status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_lifecycle';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER reservations_guard BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION reservations_guard();
--> statement-breakpoint

-- A chosen vehicle belongs to the reservation's class. A confirmed reservation holds its vehicle for [pickup, return):
-- the vehicle must be active and no other confirmed reservation of it may overlap. Serialized per vehicle with a
-- transaction lock, so two people confirming the same vehicle at the same moment cannot both succeed.
CREATE OR REPLACE FUNCTION reservations_vehicle_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_class uuid;
DECLARE v_status text;
BEGIN
  IF NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT class_id, status INTO v_class, v_status FROM vehicles WHERE company_id = NEW.company_id AND id = NEW.vehicle_id;
  IF TG_OP = 'INSERT' OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.vehicle_class_id IS DISTINCT FROM OLD.vehicle_class_id THEN
    IF v_class IS DISTINCT FROM NEW.vehicle_class_id THEN
      RAISE EXCEPTION 'the vehicle is not of the reservation class' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_vehicle_class';
    END IF;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  -- An unchanged confirmed allocation is not re-checked (e.g. editing the note after the vehicle went out of service).
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.vehicle_id = OLD.vehicle_id AND NEW.pickup_at = OLD.pickup_at AND NEW.return_at = OLD.return_at THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reservation-vehicle:' || NEW.company_id::text || ':' || NEW.vehicle_id::text, 0));
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'the vehicle is not active' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_vehicle_not_active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.company_id = NEW.company_id AND r.vehicle_id = NEW.vehicle_id AND r.status = 'confirmed' AND r.id <> NEW.id
      AND tstzrange(r.pickup_at, r.return_at, '[)') && tstzrange(NEW.pickup_at, NEW.return_at, '[)')
  ) THEN
    RAISE EXCEPTION 'the vehicle is already reserved in this period' USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_overlap';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER reservations_vehicle_guard BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION reservations_vehicle_guard();
--> statement-breakpoint

-- A driver row stays with its reservation and person; a removed driver is final.
CREATE OR REPLACE FUNCTION reservation_drivers_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.reservation_id <> OLD.reservation_id OR NEW.customer_id <> OLD.customer_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'reservation driver identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservation_drivers_immutable';
  END IF;
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a removed reservation driver cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservation_drivers_removed_final';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER reservation_drivers_guard BEFORE UPDATE ON reservation_drivers FOR EACH ROW EXECUTE FUNCTION reservation_drivers_guard();
--> statement-breakpoint

-- Runtime privileges: nothing is deleted; status events are append-only.
GRANT SELECT, INSERT, UPDATE ON reservations, reservation_drivers TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON reservation_status_events TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION reservations_guard(), reservations_vehicle_guard(), reservation_drivers_guard() TO acarvo_app;
