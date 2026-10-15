-- Maintenance, damage and vehicle transfers V1: company isolation, the one shared vehicle allocation truth extended with
-- maintenance, damage blocks and transfers, lifecycles, km/location sources and runtime privileges
-- (docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md). Existing rows are not changed. Existing tables only get wider allow-lists and
-- replaced vehicle guards that also see the new holds; earlier migration files are not edited.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['maintenance_records', 'maintenance_events', 'maintenance_photos', 'maintenance_schedules', 'damage_files', 'damage_blocks',
                           'damage_events', 'damage_photos', 'vehicle_transfers', 'transfer_events'] LOOP
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
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('vehicle_promo_photo', 'rental_inspection_photo', 'maintenance_photo', 'damage_photo'));
--> statement-breakpoint
ALTER TABLE odometer_readings DROP CONSTRAINT odometer_event_type_check;
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_event_type_check CHECK (event_type IN ('initial', 'manual', 'correction', 'rental_handover', 'rental_return',
  'maintenance_start', 'maintenance_end', 'transfer_departure', 'transfer_arrival'));
--> statement-breakpoint
ALTER TABLE odometer_readings DROP CONSTRAINT odometer_source_type_check;
--> statement-breakpoint
ALTER TABLE odometer_readings ADD CONSTRAINT odometer_source_type_check CHECK (source_type IS NULL OR source_type IN ('vehicle_create', 'manual', 'correction', 'rental_handover', 'rental_return',
  'maintenance_start', 'maintenance_end', 'transfer_departure', 'transfer_arrival'));
--> statement-breakpoint
ALTER TABLE vehicle_location_events DROP CONSTRAINT location_event_type_check;
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_event_type_check CHECK (event_type IN ('initial', 'manual', 'correction', 'rental_handover', 'rental_return',
  'maintenance_start', 'maintenance_end', 'transfer_departure', 'transfer_arrival'));
--> statement-breakpoint
ALTER TABLE vehicle_location_events DROP CONSTRAINT location_source_type_check;
--> statement-breakpoint
ALTER TABLE vehicle_location_events ADD CONSTRAINT location_source_type_check CHECK (source_type IS NULL OR source_type IN ('vehicle_create', 'manual', 'correction', 'rental_handover', 'rental_return',
  'maintenance_start', 'maintenance_end', 'transfer_departure', 'transfer_arrival'));
--> statement-breakpoint

-- A maintenance- or transfer-sourced odometer reading or location event points at a record of the same vehicle in the
-- state the step belongs to (written in the same transaction, before the status change). Going to service puts the
-- vehicle at a service provider; leaving a transfer puts it in transit; arriving puts it at the destination branch,
-- never earlier. An arrival reading is not below the departure reading.
CREATE OR REPLACE FUNCTION history_operation_source_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE m record;
DECLARE t record;
BEGIN
  IF NOT (NEW.event_type IN ('maintenance_start', 'maintenance_end', 'transfer_departure', 'transfer_arrival')
          OR NEW.source_type IN ('maintenance_start', 'maintenance_end', 'transfer_departure', 'transfer_arrival')) THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type IS DISTINCT FROM NEW.source_type THEN
    RAISE EXCEPTION 'operation history entries carry the same event and source type' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
  END IF;
  IF NEW.source_type IN ('maintenance_start', 'maintenance_end') THEN
    SELECT vehicle_id, status INTO m FROM maintenance_records WHERE company_id = NEW.company_id AND id = NEW.source_id;
    IF m IS NULL OR m.vehicle_id <> NEW.vehicle_id
       OR (NEW.source_type = 'maintenance_start' AND m.status NOT IN ('pending_approval', 'planned'))
       OR (NEW.source_type = 'maintenance_end' AND m.status <> 'awaiting_check') THEN
      RAISE EXCEPTION 'maintenance history entry must point at a maintenance record of the same vehicle in the right step' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
    END IF;
    IF TG_TABLE_NAME = 'vehicle_location_events'
       AND ((NEW.source_type = 'maintenance_start' AND NEW.location_type <> 'service_provider') OR (NEW.source_type = 'maintenance_end' AND NEW.location_type <> 'branch')) THEN
      RAISE EXCEPTION 'going to service puts the vehicle at a service provider, coming back at a branch' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
    END IF;
  ELSE
    SELECT vehicle_id, status, to_branch_id, departure_km INTO t FROM vehicle_transfers WHERE company_id = NEW.company_id AND id = NEW.source_id;
    IF t IS NULL OR t.vehicle_id <> NEW.vehicle_id
       OR (NEW.source_type = 'transfer_departure' AND t.status <> 'approved')
       OR (NEW.source_type = 'transfer_arrival' AND t.status <> 'in_transit') THEN
      RAISE EXCEPTION 'transfer history entry must point at a transfer of the same vehicle in the right step' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
    END IF;
    IF TG_TABLE_NAME = 'vehicle_location_events'
       AND ((NEW.source_type = 'transfer_departure' AND NEW.location_type <> 'in_transit')
            OR (NEW.source_type = 'transfer_arrival' AND (NEW.location_type <> 'branch' OR NEW.branch_id IS DISTINCT FROM t.to_branch_id))) THEN
      RAISE EXCEPTION 'a departure puts the vehicle in transit, an arrival at the destination branch' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
    END IF;
    IF TG_TABLE_NAME = 'odometer_readings' AND NEW.source_type = 'transfer_arrival' AND t.departure_km IS NOT NULL AND NEW.km < t.departure_km THEN
      RAISE EXCEPTION 'the arrival reading is not below the departure reading' USING ERRCODE = 'check_violation', CONSTRAINT = 'transfer_arrival_km';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER odometer_readings_operation_source_guard BEFORE INSERT ON odometer_readings FOR EACH ROW EXECUTE FUNCTION history_operation_source_guard();
--> statement-breakpoint
CREATE TRIGGER vehicle_location_events_operation_source_guard BEFORE INSERT ON vehicle_location_events FOR EACH ROW EXECUTE FUNCTION history_operation_source_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Shared vehicle allocation (plan §1). Same lock, one definition of "busy", now with three more kinds of holds.

-- The time a maintenance record holds its vehicle. Planned: the plan. In service or awaiting the check: from the real
-- start to the planned end; once the planned end has passed and the work is not completed, open-ended (as K2).
-- Completed: from the real start to completion. Pending approval and cancelled: nothing.
CREATE OR REPLACE FUNCTION maintenance_hold(status text, planned_start timestamptz, planned_end timestamptz, actual_start timestamptz, completed timestamptz)
  RETURNS tstzrange LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN status = 'planned' THEN tstzrange(planned_start, planned_end, '[)')
    WHEN status IN ('in_service', 'awaiting_check') THEN tstzrange(actual_start, CASE WHEN planned_end > now() AND planned_end > actual_start THEN planned_end END, '[)')
    WHEN status = 'completed' THEN tstzrange(actual_start, completed, '[)')
    ELSE 'empty'::tstzrange
  END $$;
--> statement-breakpoint

-- The time a transfer holds its vehicle. Approved: the plan. In transit: from the real departure to the planned arrival;
-- a late transfer stays open-ended until it is received. Completed: departure to arrival. Requested, cancelled: nothing.
CREATE OR REPLACE FUNCTION transfer_hold(status text, planned_departure timestamptz, planned_arrival timestamptz, departed timestamptz, arrived timestamptz)
  RETURNS tstzrange LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN status = 'approved' THEN tstzrange(planned_departure, planned_arrival, '[)')
    WHEN status = 'in_transit' THEN tstzrange(departed, CASE WHEN planned_arrival > now() AND planned_arrival > departed THEN planned_arrival END, '[)')
    WHEN status = 'completed' THEN tstzrange(departed, arrived, '[)')
    ELSE 'empty'::tstzrange
  END $$;
--> statement-breakpoint

-- What holds a vehicle in [from, to): confirmed reservations, rentals, maintenance, damage blocks and transfers (numbers
-- and times only, never people). An open end (to IS NULL) means "from this moment on".
CREATE OR REPLACE FUNCTION vehicle_busy(company uuid, vehicle uuid, from_at timestamptz, to_at timestamptz, except_reservation uuid, except_rental uuid,
                                        except_maintenance uuid, except_transfer uuid)
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
  UNION ALL
  SELECT 'maintenance'::text, m.id, m.maintenance_no, m.status, lower(o.span), upper(o.span)
    FROM maintenance_records m
    CROSS JOIN LATERAL (SELECT maintenance_hold(m.status, m.planned_start_at, m.planned_end_at, m.actual_start_at, m.completed_at) AS span) o
    WHERE m.company_id = company AND m.vehicle_id = vehicle AND m.status IN ('planned', 'in_service', 'awaiting_check', 'completed')
      AND m.id IS DISTINCT FROM except_maintenance
      AND o.span && tstzrange(from_at, to_at, '[)')
  UNION ALL
  SELECT 'damage'::text, d.id, d.damage_no, 'blocked'::text, b.started_at, b.ended_at
    FROM damage_blocks b JOIN damage_files d ON d.company_id = b.company_id AND d.id = b.damage_id
    WHERE b.company_id = company AND b.vehicle_id = vehicle
      AND tstzrange(b.started_at, b.ended_at, '[)') && tstzrange(from_at, to_at, '[)')
  UNION ALL
  SELECT 'transfer'::text, t.id, t.transfer_no, t.status, lower(o.span), upper(o.span)
    FROM vehicle_transfers t
    CROSS JOIN LATERAL (SELECT transfer_hold(t.status, t.planned_departure_at, t.planned_arrival_at, t.departed_at, t.arrived_at) AS span) o
    WHERE t.company_id = company AND t.vehicle_id = vehicle AND t.status IN ('approved', 'in_transit', 'completed')
      AND t.id IS DISTINCT FROM except_transfer
      AND o.span && tstzrange(from_at, to_at, '[)')
  ORDER BY 5 $$;
--> statement-breakpoint

-- The six-argument form stays for existing callers: the same definition, nothing excepted beyond the two ids.
CREATE OR REPLACE FUNCTION vehicle_busy(company uuid, vehicle uuid, from_at timestamptz, to_at timestamptz, except_reservation uuid, except_rental uuid)
  RETURNS TABLE (kind text, ref_id uuid, ref_no text, status text, starts_at timestamptz, ends_at timestamptz)
  LANGUAGE sql STABLE AS $$
  SELECT * FROM vehicle_busy(company, vehicle, from_at, to_at, except_reservation, except_rental, NULL::uuid, NULL::uuid) $$;
--> statement-breakpoint

-- Plan §1.3, commitments side: the last approved or running transfer arriving before `at` decides where the vehicle will
-- be. Returns that transfer's number when it brings the vehicle to another branch (no transfer: no answer).
CREATE OR REPLACE FUNCTION vehicle_planned_location_conflict(company uuid, vehicle uuid, at timestamptz, branch uuid)
  RETURNS text LANGUAGE sql STABLE AS $$
  SELECT t.transfer_no FROM (
    SELECT transfer_no, to_branch_id FROM vehicle_transfers
      WHERE company_id = company AND vehicle_id = vehicle AND status IN ('approved', 'in_transit') AND planned_arrival_at <= at
      ORDER BY planned_arrival_at DESC LIMIT 1) t
  WHERE t.to_branch_id <> branch $$;
--> statement-breakpoint

-- Plan §1.3, transfer side: the first confirmed reservation or prepared rental of the vehicle starting at or after the
-- arrival. Returns its number when it starts at another branch than the destination.
CREATE OR REPLACE FUNCTION transfer_next_commitment_conflict(company uuid, vehicle uuid, arrival timestamptz, destination uuid)
  RETURNS text LANGUAGE sql STABLE AS $$
  SELECT x.ref_no FROM (
    SELECT r.reservation_no AS ref_no, r.pickup_branch_id AS branch, r.pickup_at AS at FROM reservations r
      WHERE r.company_id = company AND r.vehicle_id = vehicle AND r.status = 'confirmed' AND r.pickup_at >= arrival
    UNION ALL
    SELECT k.rental_no, k.pickup_branch_id, k.planned_pickup_at FROM rentals k
      WHERE k.company_id = company AND k.vehicle_id = vehicle AND k.status = 'prepared' AND k.planned_pickup_at >= arrival
    ORDER BY 3 LIMIT 1) x
  WHERE x.branch <> destination $$;
--> statement-breakpoint

-- Replaces the reservation vehicle guard of 0028: same rules, and maintenance, damage blocks, transfers and the planned
-- location count as well (one constraint name per reason).
CREATE OR REPLACE FUNCTION reservations_vehicle_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_class uuid;
DECLARE v_status text;
DECLARE hit record;
DECLARE moved text;
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
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.vehicle_id = OLD.vehicle_id AND NEW.pickup_at = OLD.pickup_at AND NEW.return_at = OLD.return_at
     AND NEW.pickup_branch_id = OLD.pickup_branch_id THEN
    RETURN NEW;
  END IF;
  PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'the vehicle is not active' USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_vehicle_not_active';
  END IF;
  FOR hit IN SELECT * FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, NEW.pickup_at, NEW.return_at, NEW.id, NULL, NULL, NULL) LOOP
    IF hit.kind = 'reservation' THEN
      RAISE EXCEPTION 'the vehicle is already reserved in this period' USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_overlap';
    ELSIF hit.kind = 'rental' THEN
      RAISE EXCEPTION 'the vehicle is rented in this period' USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_rented';
    ELSIF hit.kind = 'maintenance' THEN
      RAISE EXCEPTION 'the vehicle is in maintenance in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_maintenance';
    ELSIF hit.kind = 'damage' THEN
      RAISE EXCEPTION 'the vehicle is blocked by damage (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_damage';
    ELSE
      RAISE EXCEPTION 'the vehicle is being transferred in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'reservations_vehicle_transfer';
    END IF;
  END LOOP;
  moved := vehicle_planned_location_conflict(NEW.company_id, NEW.vehicle_id, NEW.pickup_at, NEW.pickup_branch_id);
  IF moved IS NOT NULL THEN
    RAISE EXCEPTION 'a transfer takes the vehicle to another branch before the pickup (%)', moved USING ERRCODE = 'check_violation', CONSTRAINT = 'reservations_vehicle_transfer_location';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- Replaces the rental vehicle guard of 0028: same rules, the new holds, and the planned location of a prepared rental.
CREATE OR REPLACE FUNCTION rentals_vehicle_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_class uuid;
DECLARE v_status text;
DECLARE span tstzrange;
DECLARE hit record;
DECLARE moved text;
BEGIN
  IF NEW.status NOT IN ('prepared', 'delivered') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND NEW.vehicle_id = OLD.vehicle_id AND NEW.vehicle_class_id = OLD.vehicle_class_id
     AND NEW.planned_pickup_at = OLD.planned_pickup_at AND NEW.planned_return_at = OLD.planned_return_at AND NEW.pickup_branch_id = OLD.pickup_branch_id THEN
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
  SELECT * INTO hit FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, lower(span), upper(span), NEW.reservation_id, NEW.id, NULL, NULL) LIMIT 1;
  IF FOUND THEN
    IF hit.kind = 'reservation' THEN
      RAISE EXCEPTION 'the vehicle is reserved in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_reserved';
    ELSIF hit.kind = 'maintenance' THEN
      RAISE EXCEPTION 'the vehicle is in maintenance in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_maintenance';
    ELSIF hit.kind = 'damage' THEN
      RAISE EXCEPTION 'the vehicle is blocked by damage (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_damage';
    ELSIF hit.kind = 'transfer' THEN
      RAISE EXCEPTION 'the vehicle is being transferred in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_transfer';
    END IF;
    RAISE EXCEPTION 'the vehicle is rented in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'rentals_vehicle_overlap';
  END IF;
  IF NEW.status = 'prepared' THEN
    moved := vehicle_planned_location_conflict(NEW.company_id, NEW.vehicle_id, NEW.planned_pickup_at, NEW.pickup_branch_id);
    IF moved IS NOT NULL THEN
      RAISE EXCEPTION 'a transfer takes the vehicle to another branch before the pickup (%)', moved USING ERRCODE = 'check_violation', CONSTRAINT = 'rentals_vehicle_transfer_location';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Maintenance

-- Identity stays; pending_approval -> planned | in_service | cancelled, planned -> in_service | cancelled,
-- in_service -> awaiting_check, awaiting_check -> in_service | completed; completed and cancelled are final. The plan
-- changes only before the work starts (the expected end also while it runs). Whenever the hold appears, grows or moves,
-- nothing else may hold the vehicle then, except a damage block (repairs need the vehicle). Every history link points at
-- this record's own reading or event.
CREATE OR REPLACE FUNCTION maintenance_records_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_status text;
DECLARE span tstzrange;
DECLARE hit record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending_approval', 'planned') OR NEW.actual_start_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL
       OR NEW.start_odometer_reading_id IS NOT NULL OR NEW.end_odometer_reading_id IS NOT NULL OR NEW.start_location_event_id IS NOT NULL OR NEW.end_location_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'a maintenance record starts as a plan' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_lifecycle';
    END IF;
    SELECT status INTO v_status FROM vehicles WHERE company_id = NEW.company_id AND id = NEW.vehicle_id;
    IF v_status IN ('sold', 'disposed') THEN
      RAISE EXCEPTION 'the vehicle is no longer in the fleet' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_vehicle_retired';
    END IF;
  ELSE
    IF NEW.company_id <> OLD.company_id OR NEW.maintenance_no <> OLD.maintenance_no OR NEW.vehicle_id <> OLD.vehicle_id
       OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'maintenance identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_immutable';
    END IF;
    IF OLD.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'a % maintenance record cannot change', OLD.status USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_final';
    END IF;
    IF NOT (NEW.status = OLD.status
            OR (OLD.status = 'pending_approval' AND NEW.status IN ('planned', 'in_service', 'cancelled'))
            OR (OLD.status = 'planned' AND NEW.status IN ('in_service', 'cancelled'))
            OR (OLD.status = 'in_service' AND NEW.status = 'awaiting_check')
            OR (OLD.status = 'awaiting_check' AND NEW.status IN ('in_service', 'completed'))) THEN
      RAISE EXCEPTION 'maintenance status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_lifecycle';
    END IF;
    IF OLD.status IN ('in_service', 'awaiting_check') AND (
         NEW.type <> OLD.type OR NEW.branch_id <> OLD.branch_id OR NEW.planned_start_at <> OLD.planned_start_at OR NEW.timezone <> OLD.timezone
         OR NEW.actual_start_at IS DISTINCT FROM OLD.actual_start_at OR NEW.started_by IS DISTINCT FROM OLD.started_by OR NEW.at_provider <> OLD.at_provider
         OR NEW.start_km IS DISTINCT FROM OLD.start_km OR NEW.start_odometer_reading_id IS DISTINCT FROM OLD.start_odometer_reading_id
         OR NEW.start_location_event_id IS DISTINCT FROM OLD.start_location_event_id) THEN
      RAISE EXCEPTION 'a started maintenance keeps its start facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_started_immutable';
    END IF;
    IF OLD.approved_at IS NOT NULL AND (NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
      RAISE EXCEPTION 'the approval cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_immutable';
    END IF;
  END IF;
  IF NEW.damage_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM damage_files d WHERE d.company_id = NEW.company_id AND d.id = NEW.damage_file_id AND d.vehicle_id = NEW.vehicle_id
  ) THEN
    RAISE EXCEPTION 'the damage file belongs to another vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_damage';
  END IF;
  IF NEW.status IN ('in_service', 'awaiting_check', 'completed') THEN
    IF NEW.start_odometer_reading_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM odometer_readings r WHERE r.company_id = NEW.company_id AND r.id = NEW.start_odometer_reading_id
        AND r.source_type = 'maintenance_start' AND r.source_id = NEW.id AND r.km = NEW.start_km
    ) THEN
      RAISE EXCEPTION 'the start reading is this maintenance''s own' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
    END IF;
    IF (NEW.start_km IS NULL) <> (NEW.start_odometer_reading_id IS NULL) THEN
      RAISE EXCEPTION 'a start km is recorded in the odometer history' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
    END IF;
    IF NEW.at_provider AND NOT EXISTS (
      SELECT 1 FROM vehicle_location_events e WHERE e.company_id = NEW.company_id AND e.id = NEW.start_location_event_id
        AND e.source_type = 'maintenance_start' AND e.source_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'going to a service provider is recorded in the location history' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
    END IF;
    IF NOT NEW.at_provider AND NEW.start_location_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'only a provider visit has a start location' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
    END IF;
  END IF;
  IF NEW.status = 'completed' THEN
    IF NOT EXISTS (
      SELECT 1 FROM odometer_readings r WHERE r.company_id = NEW.company_id AND r.id = NEW.end_odometer_reading_id
        AND r.source_type = 'maintenance_end' AND r.source_id = NEW.id AND r.km = NEW.end_km
    ) THEN
      RAISE EXCEPTION 'the completion reading is this maintenance''s own' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
    END IF;
    IF NEW.at_provider AND NOT EXISTS (
      SELECT 1 FROM vehicle_location_events e WHERE e.company_id = NEW.company_id AND e.id = NEW.end_location_event_id
        AND e.source_type = 'maintenance_end' AND e.source_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'coming back from a service provider is recorded in the location history' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
    END IF;
  ELSIF NEW.end_odometer_reading_id IS NOT NULL OR NEW.end_location_event_id IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'only a completed maintenance has completion facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_records_history';
  END IF;
  -- The hold: re-checked whenever it appears, grows or moves.
  IF NEW.status IN ('planned', 'in_service', 'awaiting_check') AND (
       TG_OP = 'INSERT' OR NEW.status <> OLD.status OR NEW.planned_start_at <> OLD.planned_start_at OR NEW.planned_end_at <> OLD.planned_end_at
       OR NEW.actual_start_at IS DISTINCT FROM OLD.actual_start_at) THEN
    -- awaiting_check -> in_service (the check sent the work back) keeps the same hold.
    IF NOT (TG_OP = 'UPDATE' AND OLD.status IN ('in_service', 'awaiting_check') AND NEW.status IN ('in_service', 'awaiting_check')
            AND NEW.planned_end_at <= OLD.planned_end_at) THEN
      PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
      span := maintenance_hold(NEW.status, NEW.planned_start_at, NEW.planned_end_at, NEW.actual_start_at, NEW.completed_at);
      SELECT * INTO hit FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, lower(span), upper(span), NULL, NULL, NEW.id, NULL) b WHERE b.kind <> 'damage' LIMIT 1;
      IF FOUND THEN
        IF hit.kind = 'reservation' THEN
          RAISE EXCEPTION 'the vehicle is reserved in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'maintenance_vehicle_reserved';
        ELSIF hit.kind = 'rental' THEN
          RAISE EXCEPTION 'the vehicle is rented in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'maintenance_vehicle_rented';
        ELSIF hit.kind = 'maintenance' THEN
          RAISE EXCEPTION 'the vehicle has another maintenance in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'maintenance_vehicle_overlap';
        END IF;
        RAISE EXCEPTION 'the vehicle is being transferred in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'maintenance_vehicle_transfer';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER maintenance_records_guard BEFORE INSERT OR UPDATE ON maintenance_records FOR EACH ROW EXECUTE FUNCTION maintenance_records_guard();
--> statement-breakpoint

-- Photos are added while the record is open (at most 10 active); removal is a mark, also only while open.
CREATE OR REPLACE FUNCTION maintenance_photos_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM maintenance_records m WHERE m.company_id = NEW.company_id AND m.id = NEW.maintenance_id AND m.status NOT IN ('completed', 'cancelled')) THEN
    RAISE EXCEPTION 'photos change only while the maintenance is open' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_photos_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.maintenance_id <> OLD.maintenance_id OR NEW.file_id <> OLD.file_id
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a maintenance photo only gets a removal mark' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_photos_immutable';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('maintenance-photos:' || NEW.maintenance_id::text, 0));
  SELECT count(*) INTO n FROM maintenance_photos p WHERE p.company_id = NEW.company_id AND p.maintenance_id = NEW.maintenance_id AND p.removed_at IS NULL;
  IF n >= 10 THEN
    RAISE EXCEPTION 'a maintenance record has at most 10 photos' USING ERRCODE = 'check_violation', CONSTRAINT = 'maintenance_photos_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER maintenance_photos_guard BEFORE INSERT OR UPDATE ON maintenance_photos FOR EACH ROW EXECUTE FUNCTION maintenance_photos_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Damage

-- Identity and source links stay; a link to an inspection mark is consistent (mark of a final inspection of that rental,
-- rental of that vehicle; the mark itself is never changed). reported -> under_review | assessed | closed,
-- under_review -> assessed | closed, assessed -> under_review | closed; closed is final and needs no open block.
CREATE OR REPLACE FUNCTION damage_files_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_status <> 'reported' OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a damage file starts as reported' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_lifecycle';
    END IF;
    IF NEW.detected_at > now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'damage is not detected in the future' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_future';
    END IF;
    IF NEW.rental_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rentals k WHERE k.company_id = NEW.company_id AND k.id = NEW.rental_id AND k.vehicle_id = NEW.vehicle_id) THEN
      RAISE EXCEPTION 'the rental is of another vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_source';
    END IF;
    IF NEW.inspection_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM rental_inspections i WHERE i.company_id = NEW.company_id AND i.id = NEW.inspection_id AND i.rental_id = NEW.rental_id
        AND i.vehicle_id = NEW.vehicle_id AND i.state = 'final'
    ) THEN
      RAISE EXCEPTION 'the inspection is a final inspection of the rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_source';
    END IF;
    IF NEW.source_mark_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM rental_damage_marks m WHERE m.company_id = NEW.company_id AND m.id = NEW.source_mark_id AND m.inspection_id = NEW.inspection_id AND m.removed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'the mark belongs to the inspection' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_source';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.damage_no <> OLD.damage_no OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.rental_id IS DISTINCT FROM OLD.rental_id OR NEW.inspection_id IS DISTINCT FROM OLD.inspection_id OR NEW.source_mark_id IS DISTINCT FROM OLD.source_mark_id
     OR NEW.detected_at <> OLD.detected_at OR NEW.timezone <> OLD.timezone OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'damage file identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_immutable';
  END IF;
  IF OLD.review_status = 'closed' THEN
    RAISE EXCEPTION 'a closed damage file cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_final';
  END IF;
  IF NOT (NEW.review_status = OLD.review_status
          OR (OLD.review_status = 'reported' AND NEW.review_status IN ('under_review', 'assessed', 'closed'))
          OR (OLD.review_status = 'under_review' AND NEW.review_status IN ('assessed', 'closed'))
          OR (OLD.review_status = 'assessed' AND NEW.review_status IN ('under_review', 'closed'))) THEN
    RAISE EXCEPTION 'damage review cannot go from % to %', OLD.review_status, NEW.review_status USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_lifecycle';
  END IF;
  IF NEW.review_status = 'closed' AND EXISTS (SELECT 1 FROM damage_blocks b WHERE b.company_id = NEW.company_id AND b.damage_id = NEW.id AND b.ended_at IS NULL) THEN
    RAISE EXCEPTION 'a damage file with an open block cannot be closed' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_files_close_blocked';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER damage_files_guard BEFORE INSERT OR UPDATE ON damage_files FOR EACH ROW EXECUTE FUNCTION damage_files_guard();
--> statement-breakpoint

-- A block starts on an open file of the same vehicle (under the shared allocation lock, so it is serialized with every
-- confirmation and handover of that vehicle) and only gets an end, once.
CREATE OR REPLACE FUNCTION damage_blocks_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM damage_files d WHERE d.company_id = NEW.company_id AND d.id = NEW.damage_id AND d.vehicle_id = NEW.vehicle_id AND d.review_status <> 'closed') THEN
      RAISE EXCEPTION 'a block belongs to an open damage file of the same vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_blocks_file';
    END IF;
    IF NEW.ended_at IS NOT NULL OR NEW.started_at > now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'a block starts now or in the past and open' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_blocks_lifecycle';
    END IF;
    PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.damage_id <> OLD.damage_id OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.started_at <> OLD.started_at
     OR NEW.started_by IS DISTINCT FROM OLD.started_by OR NEW.start_reason <> OLD.start_reason OR NEW.created_at <> OLD.created_at OR OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'a damage block only gets its end, once' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_blocks_immutable';
  END IF;
  PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER damage_blocks_guard BEFORE INSERT OR UPDATE ON damage_blocks FOR EACH ROW EXECUTE FUNCTION damage_blocks_guard();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION damage_photos_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM damage_files d WHERE d.company_id = NEW.company_id AND d.id = NEW.damage_id AND d.review_status <> 'closed') THEN
    RAISE EXCEPTION 'photos change only while the damage file is open' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_photos_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.damage_id <> OLD.damage_id OR NEW.file_id <> OLD.file_id
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a damage photo only gets a removal mark' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_photos_immutable';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('damage-photos:' || NEW.damage_id::text, 0));
  SELECT count(*) INTO n FROM damage_photos p WHERE p.company_id = NEW.company_id AND p.damage_id = NEW.damage_id AND p.removed_at IS NULL;
  IF n >= 10 THEN
    RAISE EXCEPTION 'a damage file has at most 10 photos' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_photos_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER damage_photos_guard BEFORE INSERT OR UPDATE ON damage_photos FOR EACH ROW EXECUTE FUNCTION damage_photos_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Transfers

-- Identity, vehicle and origin stay; requested -> approved | cancelled, approved -> in_transit | cancelled,
-- in_transit -> completed; completed and cancelled are final. The plan changes only before departure (the destination
-- only while requested). Whenever the hold appears or moves, nothing else may hold the vehicle (damage blocks aside),
-- and the next commitment must start at the destination (plan §1.3). Departure and arrival link their own readings
-- and location events; the arrival reading is not below the departure reading.
CREATE OR REPLACE FUNCTION vehicle_transfers_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_status text;
DECLARE span tstzrange;
DECLARE hit record;
DECLARE nxt text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' OR NEW.approved_at IS NOT NULL OR NEW.departed_at IS NOT NULL OR NEW.arrived_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'a transfer starts as requested' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_lifecycle';
    END IF;
    SELECT status INTO v_status FROM vehicles WHERE company_id = NEW.company_id AND id = NEW.vehicle_id;
    IF v_status IN ('sold', 'disposed') THEN
      RAISE EXCEPTION 'the vehicle is no longer in the fleet' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_vehicle_retired';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.transfer_no <> OLD.transfer_no OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.from_branch_id <> OLD.from_branch_id
     OR NEW.from_timezone <> OLD.from_timezone OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'transfer identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_immutable';
  END IF;
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'a % transfer cannot change', OLD.status USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_final';
  END IF;
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'requested' AND NEW.status IN ('approved', 'cancelled'))
          OR (OLD.status = 'approved' AND NEW.status IN ('in_transit', 'cancelled'))
          OR (OLD.status = 'in_transit' AND NEW.status = 'completed')) THEN
    RAISE EXCEPTION 'transfer status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_lifecycle';
  END IF;
  IF OLD.status <> 'requested' AND (NEW.to_branch_id <> OLD.to_branch_id OR NEW.to_timezone <> OLD.to_timezone) THEN
    RAISE EXCEPTION 'the destination changes only while the transfer is requested' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_plan_frozen';
  END IF;
  IF OLD.status = 'in_transit' AND (NEW.planned_departure_at <> OLD.planned_departure_at OR NEW.departed_at IS DISTINCT FROM OLD.departed_at
       OR NEW.departed_by IS DISTINCT FROM OLD.departed_by OR NEW.departure_km IS DISTINCT FROM OLD.departure_km OR NEW.departure_fuel IS DISTINCT FROM OLD.departure_fuel
       OR NEW.departure_odometer_reading_id IS DISTINCT FROM OLD.departure_odometer_reading_id OR NEW.departure_location_event_id IS DISTINCT FROM OLD.departure_location_event_id
       OR NEW.planned_arrival_at <> OLD.planned_arrival_at) THEN
    RAISE EXCEPTION 'a departed transfer keeps its plan and departure facts' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_departed_immutable';
  END IF;
  IF OLD.approved_at IS NOT NULL AND (NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
    RAISE EXCEPTION 'the approval cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_immutable';
  END IF;
  IF NEW.status IN ('in_transit', 'completed') AND NOT (
    EXISTS (SELECT 1 FROM odometer_readings r WHERE r.company_id = NEW.company_id AND r.id = NEW.departure_odometer_reading_id
              AND r.source_type = 'transfer_departure' AND r.source_id = NEW.id AND r.km = NEW.departure_km)
    AND EXISTS (SELECT 1 FROM vehicle_location_events e WHERE e.company_id = NEW.company_id AND e.id = NEW.departure_location_event_id
              AND e.source_type = 'transfer_departure' AND e.source_id = NEW.id AND e.location_type = 'in_transit')
  ) THEN
    RAISE EXCEPTION 'a departure links its own reading and location event' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_history';
  END IF;
  IF NEW.status = 'completed' AND NOT (
    EXISTS (SELECT 1 FROM odometer_readings r WHERE r.company_id = NEW.company_id AND r.id = NEW.arrival_odometer_reading_id
              AND r.source_type = 'transfer_arrival' AND r.source_id = NEW.id AND r.km = NEW.arrival_km)
    AND EXISTS (SELECT 1 FROM vehicle_location_events e WHERE e.company_id = NEW.company_id AND e.id = NEW.arrival_location_event_id
              AND e.source_type = 'transfer_arrival' AND e.source_id = NEW.id AND e.location_type = 'branch' AND e.branch_id = NEW.to_branch_id)
  ) THEN
    RAISE EXCEPTION 'an arrival links its own reading and location event at the destination' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_history';
  END IF;
  IF NEW.status IN ('approved', 'in_transit') AND (NEW.status <> OLD.status OR NEW.planned_departure_at <> OLD.planned_departure_at OR NEW.planned_arrival_at <> OLD.planned_arrival_at) THEN
    PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
    span := transfer_hold(NEW.status, NEW.planned_departure_at, NEW.planned_arrival_at, NEW.departed_at, NEW.arrived_at);
    SELECT * INTO hit FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, lower(span), upper(span), NULL, NULL, NULL, NEW.id) b WHERE b.kind <> 'damage' LIMIT 1;
    IF FOUND THEN
      IF hit.kind = 'reservation' THEN
        RAISE EXCEPTION 'the vehicle is reserved in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'transfers_vehicle_reserved';
      ELSIF hit.kind = 'rental' THEN
        RAISE EXCEPTION 'the vehicle is rented in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'transfers_vehicle_rented';
      ELSIF hit.kind = 'maintenance' THEN
        RAISE EXCEPTION 'the vehicle is in maintenance in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'transfers_vehicle_maintenance';
      END IF;
      RAISE EXCEPTION 'the vehicle has another transfer in this period (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'transfers_vehicle_overlap';
    END IF;
    nxt := transfer_next_commitment_conflict(NEW.company_id, NEW.vehicle_id, NEW.planned_arrival_at, NEW.to_branch_id);
    IF nxt IS NOT NULL THEN
      RAISE EXCEPTION 'the next commitment of the vehicle starts at another branch (%)', nxt USING ERRCODE = 'check_violation', CONSTRAINT = 'transfers_next_commitment_branch';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER vehicle_transfers_guard BEFORE INSERT OR UPDATE ON vehicle_transfers FOR EACH ROW EXECUTE FUNCTION vehicle_transfers_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- History is kept for every role: events never change; no maintenance, damage or transfer record is ever deleted.
CREATE OR REPLACE FUNCTION operations_history_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are kept as history: % is not allowed', TG_TABLE_NAME, lower(TG_OP) USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_history';
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['maintenance_events', 'damage_events', 'transfer_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION operations_history_guard()', t || '_history', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['maintenance_records', 'maintenance_photos', 'damage_files', 'damage_blocks', 'damage_photos', 'vehicle_transfers'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION operations_history_guard()', t || '_no_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Runtime privileges: nothing is deleted; events are append-only; a service interval is replaced, never removed.
GRANT SELECT, INSERT, UPDATE ON maintenance_records, maintenance_photos, maintenance_schedules, damage_files, damage_blocks, damage_photos, vehicle_transfers TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON maintenance_events, damage_events, transfer_events TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION history_operation_source_guard(), maintenance_hold(text, timestamptz, timestamptz, timestamptz, timestamptz),
  transfer_hold(text, timestamptz, timestamptz, timestamptz, timestamptz), vehicle_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid, uuid, uuid),
  vehicle_planned_location_conflict(uuid, uuid, timestamptz, uuid), transfer_next_commitment_conflict(uuid, uuid, timestamptz, uuid),
  maintenance_records_guard(), maintenance_photos_guard(), damage_files_guard(), damage_blocks_guard(), damage_photos_guard(), vehicle_transfers_guard(),
  operations_history_guard() TO acarvo_app;
