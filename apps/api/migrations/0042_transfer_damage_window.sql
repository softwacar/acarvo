-- Correction of 0041 (test database only so far): a normal transfer is refused for a damage block that holds the vehicle
-- from now on, not for a block that was already lifted earlier in the planned window (e.g. a departure planned a few
-- minutes ago). Everything else as in 0041.
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
    IF NEW.transport_ack_at IS NOT NULL THEN
      RAISE EXCEPTION 'the transport statement is given at departure' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_lifecycle';
    END IF;
    IF NEW.purpose = 'repair' AND NOT EXISTS (
      SELECT 1 FROM damage_files d WHERE d.company_id = NEW.company_id AND d.id = NEW.damage_file_id AND d.vehicle_id = NEW.vehicle_id AND d.review_status <> 'closed'
    ) THEN
      RAISE EXCEPTION 'a repair transport belongs to an open damage file of the same vehicle' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_repair_damage';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.transfer_no <> OLD.transfer_no OR NEW.vehicle_id <> OLD.vehicle_id OR NEW.from_branch_id <> OLD.from_branch_id
     OR NEW.from_timezone <> OLD.from_timezone OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.purpose <> OLD.purpose OR NEW.damage_file_id IS DISTINCT FROM OLD.damage_file_id OR NEW.transport_method IS DISTINCT FROM OLD.transport_method THEN
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
  IF OLD.transport_ack_at IS NOT NULL AND (NEW.transport_ack_at IS DISTINCT FROM OLD.transport_ack_at OR NEW.transport_ack_by IS DISTINCT FROM OLD.transport_ack_by) THEN
    RAISE EXCEPTION 'the transport statement cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_immutable';
  END IF;
  IF NEW.transport_ack_at IS NOT NULL AND NEW.status NOT IN ('in_transit', 'completed') THEN
    RAISE EXCEPTION 'the transport statement is given at departure' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_lifecycle';
  END IF;
  IF NEW.purpose = 'repair' AND NEW.status = 'in_transit' AND OLD.status = 'approved' AND NEW.transport_ack_at IS NULL THEN
    RAISE EXCEPTION 'a repair transport leaves only with the transport statement' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_transport_ack';
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
    -- A vehicle marked not usable never goes on a normal transfer; only a repair transport (carried, not driven) may move it.
    IF NEW.purpose = 'operational' THEN
      SELECT * INTO hit FROM vehicle_busy(NEW.company_id, NEW.vehicle_id, greatest(lower(span), now()), upper(span), NULL, NULL, NULL, NEW.id) b WHERE b.kind = 'damage' LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'the vehicle is marked not usable (%)', hit.ref_no USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'transfers_vehicle_damaged';
      END IF;
    END IF;
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
