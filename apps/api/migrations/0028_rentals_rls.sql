-- Rentals, handover and return V1: company isolation, one shared vehicle allocation guard for reservations and rentals,
-- lifecycle and evidence guards, runtime privileges (docs/KIRALAMA_TESLIM_IADE_PLANI.md §3).
-- Existing rows are not changed. Existing tables only get wider allow-lists (files, odometer and location sources) and a
-- replaced reservation vehicle guard that also sees rentals; migration 0026 itself is not edited.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rentals', 'rental_drivers', 'rental_events', 'rental_document_checks', 'rental_inspections', 'rental_inspection_photos', 'rental_damage_marks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Wider allow-lists. Existing rows only use the old values, so they stay valid.
ALTER TABLE files DROP CONSTRAINT files_kind_check;
--> statement-breakpoint
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('vehicle_promo_photo', 'rental_inspection_photo'));
--> statement-breakpoint
ALTER TABLE odometer_readings DROP CONSTRAINT odometer_event_type_check;
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_event_type_check CHECK (event_type IN ('initial', 'manual', 'correction', 'rental_handover', 'rental_return'));
--> statement-breakpoint
ALTER TABLE odometer_readings DROP CONSTRAINT odometer_source_type_check;
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_source_type_check CHECK (source_type IS NULL OR source_type IN ('vehicle_create', 'manual', 'correction', 'rental_handover', 'rental_return'));
--> statement-breakpoint
ALTER TABLE vehicle_location_events DROP CONSTRAINT location_event_type_check;
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_event_type_check CHECK (event_type IN ('initial', 'manual', 'correction', 'rental_handover', 'rental_return'));
--> statement-breakpoint
ALTER TABLE vehicle_location_events DROP CONSTRAINT location_source_type_check;
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_source_type_check CHECK (source_type IS NULL OR source_type IN ('vehicle_create', 'manual', 'correction', 'rental_handover', 'rental_return'));
--> statement-breakpoint

-- A rental-sourced odometer reading or location event points at the open inspection of the same vehicle and kind.
-- Handover: the vehicle is with the customer. Return: the vehicle is at a branch.
CREATE OR REPLACE FUNCTION history_rental_source_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE i record;
BEGIN
  IF NEW.event_type IN ('rental_handover', 'rental_return') OR NEW.source_type IN ('rental_handover', 'rental_return') THEN
    IF NEW.event_type IS DISTINCT FROM NEW.source_type THEN
      RAISE EXCEPTION 'rental history entries carry the same event and source type' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_rental_source';
    END IF;
    SELECT vehicle_id, kind, state INTO i FROM rental_inspections WHERE company_id = NEW.company_id AND id = NEW.source_id;
    IF i IS NULL OR i.vehicle_id <> NEW.vehicle_id OR i.state <> 'draft'
       OR (NEW.source_type = 'rental_handover' AND i.kind <> 'handover') OR (NEW.source_type = 'rental_return' AND i.kind <> 'return') THEN
      RAISE EXCEPTION 'rental history entry must point at an open inspection of the same vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_rental_source';
    END IF;
    IF TG_TABLE_NAME = 'vehicle_location_events' THEN
      IF (NEW.source_type = 'rental_handover' AND NEW.location_type <> 'with_customer') OR (NEW.source_type = 'rental_return' AND NEW.location_type <> 'branch') THEN
        RAISE EXCEPTION 'handover puts the vehicle with the customer, return at a branch' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_rental_source';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER odometer_readings_rental_source_guard BEFORE INSERT ON odometer_readings FOR EACH ROW EXECUTE FUNCTION history_rental_source_guard();
--> statement-breakpoint
CREATE TRIGGER vehicle_location_events_rental_source_guard BEFORE INSERT ON vehicle_location_events FOR EACH ROW EXECUTE FUNCTION history_rental_source_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Shared vehicle allocation (plan §3.1). One lock per vehicle for every allocation write, from reservations, rentals
-- and the API alike, and one definition of "busy", used by the reservation guard, the rental guard and the API.

CREATE OR REPLACE FUNCTION vehicle_allocation_lock(company uuid, vehicle uuid) RETURNS void
  LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(hashtextextended('vehicle-allocation:' || company::text || ':' || vehicle::text, 0)) $$;
--> statement-breakpoint

-- The time a rental holds its vehicle. Prepared: the plan. Delivered: from the real handover to the planned return;
-- once the planned return has passed and the vehicle is not back, open-ended until it is returned (K2).
-- Returned or closed: from handover to the real return. Cancelled: nothing.
CREATE OR REPLACE FUNCTION rental_occupancy(status text, planned_pickup timestamptz, planned_return timestamptz, delivered timestamptz, returned timestamptz)
  RETURNS tstzrange LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN status = 'prepared' THEN tstzrange(planned_pickup, planned_return, '[)')
    WHEN status = 'delivered' THEN tstzrange(delivered, CASE WHEN planned_return > now() THEN planned_return END, '[)')
    WHEN status IN ('returned', 'closed') THEN tstzrange(delivered, returned, '[)')
    ELSE 'empty'::tstzrange
  END $$;
--> statement-breakpoint

-- What holds a vehicle in [from, to): confirmed reservations and rentals (numbers and times only, never people).
-- An open end (to IS NULL) means "from this moment on".
CREATE OR REPLACE FUNCTION vehicle_busy(company uuid, vehicle uuid, from_at timestamptz, to_at timestamptz, except_reservation uuid, except_rental uuid)
  RETURNS TABLE (kind text, ref_id uuid, ref_no text, status text, starts_at timestamptz, ends_at timestamptz)
  LANGUAGE sql STABLE AS $$
  SELECT 'reservation'::text, r.id, r.reservation_no, r.status, r.pickup_at, r.return_at
    FROM reservations r
    WHERE r.company_id = company AND r.vehicle_id = vehicle AND r.status = 'confirmed'
      AND r.id IS DISTINCT FROM except_reservation
      AND tstzrange(r.pickup_at, r.return_at, '[)') && tstzrange(from_at, to_at, '[)')
  UNION ALL
  SELECT 'rental'::text, k.id, k.rental_no, k.status, lower(o.span), upper(o.span)
    FROM rentals k
    CROSS JOIN LATERAL (SELECT rental_occupancy(k.status, k.planned_pickup_at, k.planned_return_at, k.delivered_at, k.returned_at) AS span) o
    WHERE k.company_id = company AND k.vehicle_id = vehicle AND k.status IN ('prepared', 'delivered', 'returned', 'closed')
      AND k.id IS DISTINCT FROM except_rental
      AND o.span && tstzrange(from_at, to_at, '[)')
  ORDER BY 5 $$;
--> statement-breakpoint

-- Replaces the reservation vehicle guard of 0026: same rules, the shared lock, and rentals count as well.
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
  PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'the vehicle is not active' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_vehicle_not_active';
  END IF;
  IF EXISTS (SELECT 1 FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, NEW.pickup_at, NEW.return_at, NEW.id, NULL) b WHERE b.kind = 'reservation') THEN
    RAISE EXCEPTION 'the vehicle is already reserved in this period' USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_overlap';
  END IF;
  IF EXISTS (SELECT 1 FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, NEW.pickup_at, NEW.return_at, NEW.id, NULL) b WHERE b.kind = 'rental') THEN
    RAISE EXCEPTION 'the vehicle is rented in this period' USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_rented';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Rentals

-- Identity stays; the lifecycle prepared -> delivered -> returned -> closed, prepared -> cancelled; closed and cancelled
-- are final. Once handed over, the vehicle, customer and handover facts stay; once returned, the return facts stay too.
-- Handing over needs a final handover inspection; returning needs the return reading; closing a final return inspection.
CREATE OR REPLACE FUNCTION rentals_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'prepared' THEN
      RAISE EXCEPTION 'a rental starts as prepared' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_lifecycle';
    END IF;
    IF NEW.reservation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM reservations r WHERE r.company_id = NEW.company_id AND r.id = NEW.reservation_id AND r.status = 'converted'
    ) THEN
      RAISE EXCEPTION 'the reservation must be converted in the same transaction' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_reservation_converted';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.rental_no <> OLD.rental_no OR NEW.origin <> OLD.origin
     OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'rental identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_immutable';
  END IF;
  IF OLD.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'a % rental cannot change', OLD.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_final';
  END IF;
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'prepared' AND NEW.status IN ('delivered', 'cancelled'))
          OR (OLD.status = 'delivered' AND NEW.status = 'returned')
          OR (OLD.status = 'returned' AND NEW.status = 'closed')) THEN
    RAISE EXCEPTION 'rental status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_lifecycle';
  END IF;
  IF OLD.status IN ('delivered', 'returned') AND (
       NEW.customer_id <> OLD.customer_id OR NEW.corporate_account_id IS DISTINCT FROM OLD.corporate_account_id
       OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.vehicle_class_id <> OLD.vehicle_class_id
       OR NEW.pickup_branch_id <> OLD.pickup_branch_id OR NEW.planned_pickup_at <> OLD.planned_pickup_at OR NEW.pickup_timezone <> OLD.pickup_timezone
       OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at OR NEW.delivered_by IS DISTINCT FROM OLD.delivered_by
       OR NEW.external_terms_ack_at IS DISTINCT FROM OLD.external_terms_ack_at OR NEW.external_terms_ack_by IS DISTINCT FROM OLD.external_terms_ack_by) THEN
    RAISE EXCEPTION 'a handed-over rental keeps its vehicle, customer and handover facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_delivered_immutable';
  END IF;
  IF OLD.status = 'returned' AND (
       NEW.planned_return_at <> OLD.planned_return_at OR NEW.return_branch_id <> OLD.return_branch_id OR NEW.return_timezone <> OLD.return_timezone
       OR NEW.returned_at IS DISTINCT FROM OLD.returned_at OR NEW.returned_by IS DISTINCT FROM OLD.returned_by
       OR NEW.actual_return_branch_id IS DISTINCT FROM OLD.actual_return_branch_id OR NEW.actual_return_timezone IS DISTINCT FROM OLD.actual_return_timezone) THEN
    RAISE EXCEPTION 'a returned rental keeps its return facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_returned_immutable';
  END IF;
  IF OLD.status = 'prepared' AND NEW.status = 'delivered' AND NOT EXISTS (
    SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.rental_id = NEW.id AND i.kind = 'handover' AND i.state = 'final' AND i.vehicle_id = NEW.vehicle_id
  ) THEN
    RAISE EXCEPTION 'a rental is handed over with a final handover inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_handover_evidence';
  END IF;
  IF OLD.status = 'delivered' AND NEW.status = 'returned' AND NOT EXISTS (
    SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.rental_id = NEW.id AND i.kind = 'return'
      AND i.odometer_reading_id IS NOT NULL AND i.location_event_id IS NOT NULL AND i.km IS NOT NULL AND i.fuel IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a rental is returned with its return reading' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_return_evidence';
  END IF;
  IF OLD.status = 'returned' AND NEW.status = 'closed' AND NOT EXISTS (
    SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.rental_id = NEW.id AND i.kind = 'return' AND i.state = 'final'
  ) THEN
    RAISE EXCEPTION 'a rental is closed with a final return inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_close_evidence';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rentals_guard BEFORE INSERT OR UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION rentals_guard();
--> statement-breakpoint

-- The vehicle belongs to the rental class and must be active when it is allocated or handed over. Whenever the time a
-- rental holds its vehicle grows or moves, nothing else may hold the vehicle then (shared lock and definition).
CREATE OR REPLACE FUNCTION rentals_vehicle_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_class uuid;
DECLARE v_status text;
DECLARE span tstzrange;
DECLARE hit record;
BEGIN
  IF NEW.status NOT IN ('prepared', 'delivered') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND NEW.vehicle_id = OLD.vehicle_id AND NEW.vehicle_class_id = OLD.vehicle_class_id
     AND NEW.planned_pickup_at = OLD.planned_pickup_at AND NEW.planned_return_at = OLD.planned_return_at THEN
    RETURN NEW;
  END IF;
  PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
  SELECT class_id, status INTO v_class, v_status FROM vehicles WHERE company_id = NEW.company_id AND id = NEW.vehicle_id;
  IF v_class IS DISTINCT FROM NEW.vehicle_class_id THEN
    RAISE EXCEPTION 'the vehicle is not of the rental class' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_vehicle_class';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.status <> OLD.status) AND v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'the vehicle is not active' USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_vehicle_not_active';
  END IF;
  span := rental_occupancy(NEW.status, NEW.planned_pickup_at, NEW.planned_return_at, NEW.delivered_at, NEW.returned_at);
  SELECT * INTO hit FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, lower(span), upper(span), NEW.reservation_id, NEW.id) LIMIT 1;
  IF FOUND THEN
    IF hit.kind = 'reservation' THEN
      RAISE EXCEPTION 'the vehicle is reserved in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_reserved';
    END IF;
    RAISE EXCEPTION 'the vehicle is rented in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_overlap';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rentals_vehicle_guard BEFORE INSERT OR UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION rentals_vehicle_guard();
--> statement-breakpoint

-- Drivers change only while the rental is being prepared; a driver row keeps its rental and person; removal is final.
CREATE OR REPLACE FUNCTION rental_drivers_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rentals k WHERE k.company_id = NEW.company_id AND k.id = NEW.rental_id AND k.status = 'prepared') THEN
    RAISE EXCEPTION 'drivers change only while the rental is prepared' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_drivers_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.rental_id <> OLD.rental_id OR NEW.customer_id <> OLD.customer_id
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'rental driver identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_drivers_immutable';
    END IF;
    IF OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a removed rental driver cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_drivers_removed_final';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rental_drivers_guard BEFORE INSERT OR UPDATE ON rental_drivers FOR EACH ROW EXECUTE FUNCTION rental_drivers_guard();
--> statement-breakpoint

-- A document decision is recorded while the rental is being prepared, for one of its active drivers.
CREATE OR REPLACE FUNCTION rental_document_checks_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rentals k WHERE k.company_id = NEW.company_id AND k.id = NEW.rental_id AND k.status = 'prepared') THEN
    RAISE EXCEPTION 'document decisions are recorded while the rental is prepared' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_document_checks_frozen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rental_drivers d WHERE d.company_id = NEW.company_id AND d.rental_id = NEW.rental_id AND d.customer_id = NEW.customer_id AND d.removed_at IS NULL) THEN
    RAISE EXCEPTION 'the person is not a driver of this rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_document_checks_driver';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rental_document_checks_guard BEFORE INSERT ON rental_document_checks FOR EACH ROW EXECUTE FUNCTION rental_document_checks_guard();
--> statement-breakpoint

-- Inspections: identity stays; a final inspection never changes. The handover inspection is open only while the rental
-- is prepared, the return inspection only while it is delivered or returned. Finalizing needs the odometer reading and
-- location event and 4 or 5 active photos (spec §59B); the counterpart must be a driver of the rental.
CREATE OR REPLACE FUNCTION rental_inspections_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE k record;
DECLARE n integer;
BEGIN
  SELECT status, vehicle_id INTO k FROM rentals WHERE company_id = NEW.company_id AND id = NEW.rental_id;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.rental_id <> OLD.rental_id OR NEW.kind <> OLD.kind
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'inspection identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_immutable';
    END IF;
    IF OLD.state = 'final' THEN
      RAISE EXCEPTION 'a final inspection cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_final';
    END IF;
  END IF;
  IF (NEW.kind = 'handover' AND k.status <> 'prepared') OR (NEW.kind = 'return' AND k.status NOT IN ('delivered', 'returned')) THEN
    RAISE EXCEPTION 'this inspection is not open for the rental status %', k.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_window';
  END IF;
  IF NEW.vehicle_id <> k.vehicle_id THEN
    RAISE EXCEPTION 'the inspection is of the rental vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_vehicle';
  END IF;
  IF NEW.counterpart_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rental_drivers d WHERE d.company_id = NEW.company_id AND d.rental_id = NEW.rental_id AND d.customer_id = NEW.counterpart_customer_id AND d.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'the counterpart must be a driver of the rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_counterpart';
  END IF;
  IF NEW.state = 'final' THEN
    IF NEW.odometer_reading_id IS NULL OR NEW.location_event_id IS NULL THEN
      RAISE EXCEPTION 'a final inspection links its odometer reading and location event' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_history';
    END IF;
    SELECT count(*) INTO n FROM rental_inspection_photos p WHERE p.company_id = NEW.company_id AND p.inspection_id = NEW.id AND p.removed_at IS NULL;
    IF n < 4 OR n > 5 THEN
      RAISE EXCEPTION 'a final inspection has 4 or 5 photos, not %', n USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspections_photos';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rental_inspections_guard BEFORE INSERT OR UPDATE ON rental_inspections FOR EACH ROW EXECUTE FUNCTION rental_inspections_guard();
--> statement-breakpoint

-- Photos are added to an open inspection (at most 5 active); removal is a mark, only while open; identity stays.
CREATE OR REPLACE FUNCTION rental_inspection_photos_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.id = NEW.inspection_id AND i.state = 'draft') THEN
    RAISE EXCEPTION 'photos change only on an open inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspection_photos_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.inspection_id <> OLD.inspection_id OR NEW.file_id <> OLD.file_id OR NEW.angle <> OLD.angle
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'an inspection photo only gets a removal mark' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspection_photos_immutable';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rental-inspection:' || NEW.inspection_id::text, 0));
  SELECT count(*) INTO n FROM rental_inspection_photos p WHERE p.company_id = NEW.company_id AND p.inspection_id = NEW.inspection_id AND p.removed_at IS NULL;
  IF n >= 5 THEN
    RAISE EXCEPTION 'an inspection has at most 5 photos' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_inspection_photos_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rental_inspection_photos_guard BEFORE INSERT OR UPDATE ON rental_inspection_photos FOR EACH ROW EXECUTE FUNCTION rental_inspection_photos_guard();
--> statement-breakpoint

-- Marks change only on an open inspection; a linked photo belongs to the same inspection; a return mark may point at a
-- handover mark of the same rental; removal is a mark.
CREATE OR REPLACE FUNCTION rental_damage_marks_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE i record;
BEGIN
  SELECT rental_id, kind, state INTO i FROM rental_inspections WHERE company_id = NEW.company_id AND id = NEW.inspection_id;
  IF i IS NULL OR i.state <> 'draft' THEN
    RAISE EXCEPTION 'marks change only on an open inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_damage_marks_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.inspection_id <> OLD.inspection_id OR NEW.created_at <> OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a removed or moved mark cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_damage_marks_immutable';
    END IF;
  END IF;
  IF NEW.photo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rental_inspection_photos p WHERE p.company_id = NEW.company_id AND p.id = NEW.photo_id AND p.inspection_id = NEW.inspection_id
  ) THEN
    RAISE EXCEPTION 'the photo belongs to another inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_damage_marks_photo';
  END IF;
  IF NEW.existing_mark_id IS NOT NULL AND (i.kind <> 'return' OR NOT EXISTS (
    SELECT 1 FROM rental_damage_marks m JOIN rental_inspections h ON h.company_id = m.company_id AND h.id = m.inspection_id
    WHERE m.company_id = NEW.company_id AND m.id = NEW.existing_mark_id AND h.rental_id = i.rental_id AND h.kind = 'handover' AND m.removed_at IS NULL
  )) THEN
    RAISE EXCEPTION 'a return mark may only point at a handover mark of the same rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_damage_marks_existing';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rental_damage_marks_guard BEFORE INSERT OR UPDATE ON rental_damage_marks FOR EACH ROW EXECUTE FUNCTION rental_damage_marks_guard();
--> statement-breakpoint

-- Runtime privileges: nothing is deleted; events and document decisions are append-only.
GRANT SELECT, INSERT, UPDATE ON rentals, rental_drivers, rental_inspections, rental_inspection_photos, rental_damage_marks TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON rental_events, rental_document_checks TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION history_rental_source_guard(), vehicle_allocation_lock(uuid, uuid), rental_occupancy(text, timestamptz, timestamptz, timestamptz, timestamptz),
  vehicle_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid), reservations_vehicle_guard(), rentals_guard(), rentals_vehicle_guard(), rental_drivers_guard(),
  rental_document_checks_guard(), rental_inspections_guard(), rental_inspection_photos_guard(), rental_damage_marks_guard() TO acarvo_app;
