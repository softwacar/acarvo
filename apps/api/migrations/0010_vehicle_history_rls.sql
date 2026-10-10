-- Odometer and location management: isolation, allowed values, integrity guards and runtime privileges.
-- Additive only: existing readings, location events and vehicles are not changed (docs §8.5).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['odometer_corrections', 'vehicle_location_corrections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Allowed values. Existing rows only use event_type 'initial' and a NULL source, so they stay valid.
ALTER TABLE odometer_readings DROP CONSTRAINT odometer_event_type_check;
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_event_type_check CHECK (event_type IN ('initial', 'manual', 'correction'));
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_source_type_check CHECK (source_type IS NULL OR source_type IN ('vehicle_create', 'manual', 'correction'));
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_jump_reason_check CHECK (jump_reason IS NULL OR char_length(jump_reason) BETWEEN 5 AND 300);
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_event_type_check CHECK (event_type IN ('initial', 'manual', 'correction'));
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_source_type_check CHECK (source_type IS NULL OR source_type IN ('vehicle_create', 'manual', 'correction'));
--> statement-breakpoint
ALTER TABLE odometer_corrections ADD CONSTRAINT odometer_corrections_action_check CHECK (action IN ('replace', 'void'));
--> statement-breakpoint
ALTER TABLE vehicle_location_corrections ADD CONSTRAINT vehicle_location_corrections_action_check CHECK (action IN ('replace', 'void'));
--> statement-breakpoint

-- One lock per vehicle serialises every odometer/location write, from the API and from these guards.
CREATE OR REPLACE FUNCTION lock_vehicle_history(vehicle uuid) RETURNS void
  LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(hashtextextended('vehicle-history:' || vehicle::text, 0)) $$;
--> statement-breakpoint

-- Odometer readings:
--  * no reading in the future,
--  * a replacement reading belongs to a 'replace' correction of the same vehicle and keeps the corrected reading's time,
--  * effective readings stay in chronological order: previous <= km <= next. A back-dated reading can neither
--    lower the current odometer nor break the order of the past. (Corrected readings are not effective.)
CREATE OR REPLACE FUNCTION odometer_readings_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  corr record;
  prev_km integer;
  next_km integer;
BEGIN
  PERFORM lock_vehicle_history(NEW.vehicle_id);
  IF NEW.occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'odometer reading is in the future' USING ERRCODE = 'check_violation', CONSTRAINT = 'odometer_future';
  END IF;
  IF NEW.source_type = 'correction' THEN
    SELECT c.vehicle_id, c.action, r.occurred_at INTO corr
      FROM odometer_corrections c JOIN odometer_readings r ON r.company_id = c.company_id AND r.id = c.reading_id
      WHERE c.company_id = NEW.company_id AND c.id = NEW.source_id;
    IF corr IS NULL OR corr.vehicle_id <> NEW.vehicle_id OR corr.action <> 'replace' OR corr.occurred_at <> NEW.occurred_at OR NEW.event_type <> 'correction' THEN
      RAISE EXCEPTION 'replacement reading must follow a replace correction of the same vehicle and keep its time' USING ERRCODE = 'check_violation', CONSTRAINT = 'odometer_correction_link';
    END IF;
  ELSIF NEW.event_type = 'correction' THEN
    RAISE EXCEPTION 'correction reading must link its correction' USING ERRCODE = 'check_violation', CONSTRAINT = 'odometer_correction_link';
  END IF;
  SELECT max(r.km) INTO prev_km FROM odometer_readings r
    WHERE r.company_id = NEW.company_id AND r.vehicle_id = NEW.vehicle_id AND r.occurred_at <= NEW.occurred_at
      AND NOT EXISTS (SELECT 1 FROM odometer_corrections c WHERE c.company_id = r.company_id AND c.reading_id = r.id);
  SELECT min(r.km) INTO next_km FROM odometer_readings r
    WHERE r.company_id = NEW.company_id AND r.vehicle_id = NEW.vehicle_id AND r.occurred_at > NEW.occurred_at
      AND NOT EXISTS (SELECT 1 FROM odometer_corrections c WHERE c.company_id = r.company_id AND c.reading_id = r.id);
  IF (prev_km IS NOT NULL AND NEW.km < prev_km) OR (next_km IS NOT NULL AND NEW.km > next_km) THEN
    RAISE EXCEPTION 'odometer reading out of chronological order' USING ERRCODE = 'check_violation', CONSTRAINT = 'odometer_chronology';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER odometer_readings_guard BEFORE INSERT ON odometer_readings FOR EACH ROW EXECUTE FUNCTION odometer_readings_guard();
--> statement-breakpoint

-- Location events:
--  * no event in the future,
--  * manual entries and their corrections may only say "at a branch" or "at a service provider" (with its name);
--    in transit, with customer and at supplier come from the transfer, rental and supplier modules later,
--  * a replacement event belongs to a 'replace' correction of the same vehicle and keeps the corrected event's time.
CREATE OR REPLACE FUNCTION vehicle_location_events_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  corr record;
BEGIN
  PERFORM lock_vehicle_history(NEW.vehicle_id);
  IF NEW.occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'location event is in the future' USING ERRCODE = 'check_violation', CONSTRAINT = 'location_future';
  END IF;
  IF NEW.event_type IN ('manual', 'correction') THEN
    IF NEW.location_type NOT IN ('branch', 'service_provider') THEN
      RAISE EXCEPTION 'manual location must be a branch or a service provider' USING ERRCODE = 'check_violation', CONSTRAINT = 'location_manual_type';
    END IF;
    IF NEW.location_type = 'service_provider' AND coalesce(btrim(NEW.description), '') = '' THEN
      RAISE EXCEPTION 'service provider location needs a name' USING ERRCODE = 'check_violation', CONSTRAINT = 'location_manual_type';
    END IF;
  END IF;
  IF NEW.source_type = 'correction' THEN
    SELECT c.vehicle_id, c.action, e.occurred_at INTO corr
      FROM vehicle_location_corrections c JOIN vehicle_location_events e ON e.company_id = c.company_id AND e.id = c.event_id
      WHERE c.company_id = NEW.company_id AND c.id = NEW.source_id;
    IF corr IS NULL OR corr.vehicle_id <> NEW.vehicle_id OR corr.action <> 'replace' OR corr.occurred_at <> NEW.occurred_at OR NEW.event_type <> 'correction' THEN
      RAISE EXCEPTION 'replacement location must follow a replace correction of the same vehicle and keep its time' USING ERRCODE = 'check_violation', CONSTRAINT = 'location_correction_link';
    END IF;
  ELSIF NEW.event_type = 'correction' THEN
    RAISE EXCEPTION 'correction event must link its correction' USING ERRCODE = 'check_violation', CONSTRAINT = 'location_correction_link';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER vehicle_location_events_guard BEFORE INSERT ON vehicle_location_events FOR EACH ROW EXECUTE FUNCTION vehicle_location_events_guard();
--> statement-breakpoint

-- A correction points at a record of the same vehicle.
CREATE OR REPLACE FUNCTION odometer_corrections_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_vehicle_history(NEW.vehicle_id);
  IF NOT EXISTS (SELECT 1 FROM odometer_readings r WHERE r.company_id = NEW.company_id AND r.id = NEW.reading_id AND r.vehicle_id = NEW.vehicle_id) THEN
    RAISE EXCEPTION 'corrected reading must belong to the same vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'odometer_correction_link';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER odometer_corrections_guard BEFORE INSERT ON odometer_corrections FOR EACH ROW EXECUTE FUNCTION odometer_corrections_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vehicle_location_corrections_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_vehicle_history(NEW.vehicle_id);
  IF NOT EXISTS (SELECT 1 FROM vehicle_location_events e WHERE e.company_id = NEW.company_id AND e.id = NEW.event_id AND e.vehicle_id = NEW.vehicle_id) THEN
    RAISE EXCEPTION 'corrected location event must belong to the same vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'location_correction_link';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER vehicle_location_corrections_guard BEFORE INSERT ON vehicle_location_corrections FOR EACH ROW EXECUTE FUNCTION vehicle_location_corrections_guard();
--> statement-breakpoint

-- Runtime privileges: histories and corrections are append-only (no UPDATE, no DELETE).
GRANT SELECT, INSERT ON odometer_corrections, vehicle_location_corrections TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lock_vehicle_history(uuid), odometer_readings_guard(), vehicle_location_events_guard(), odometer_corrections_guard(), vehicle_location_corrections_guard() TO acarvo_app;
