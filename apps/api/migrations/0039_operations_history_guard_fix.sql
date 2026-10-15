-- Maintenance, damage and transfers V1, correction of 0038 (test database only so far): PL/pgSQL does not short-circuit
-- `TG_TABLE_NAME = ... AND NEW.column`, so the guard shared by the odometer and location tables must read a column only
-- inside a branch for its own table. Same rules as 0038; only the nesting changes.
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
    IF TG_TABLE_NAME = 'vehicle_location_events' THEN
      IF (NEW.source_type = 'maintenance_start' AND NEW.location_type <> 'service_provider') OR (NEW.source_type = 'maintenance_end' AND NEW.location_type <> 'branch') THEN
        RAISE EXCEPTION 'going to service puts the vehicle at a service provider, coming back at a branch' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
      END IF;
    END IF;
  ELSE
    SELECT vehicle_id, status, to_branch_id, departure_km INTO t FROM vehicle_transfers WHERE company_id = NEW.company_id AND id = NEW.source_id;
    IF t IS NULL OR t.vehicle_id <> NEW.vehicle_id
       OR (NEW.source_type = 'transfer_departure' AND t.status <> 'approved')
       OR (NEW.source_type = 'transfer_arrival' AND t.status <> 'in_transit') THEN
      RAISE EXCEPTION 'transfer history entry must point at a transfer of the same vehicle in the right step' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
    END IF;
    IF TG_TABLE_NAME = 'vehicle_location_events' THEN
      IF (NEW.source_type = 'transfer_departure' AND NEW.location_type <> 'in_transit')
         OR (NEW.source_type = 'transfer_arrival' AND (NEW.location_type <> 'branch' OR NEW.branch_id IS DISTINCT FROM t.to_branch_id)) THEN
        RAISE EXCEPTION 'a departure puts the vehicle in transit, an arrival at the destination branch' USING ERRCODE = 'check_violation', CONSTRAINT = 'history_operation_source';
      END IF;
    ELSIF NEW.source_type = 'transfer_arrival' AND t.departure_km IS NOT NULL THEN
      IF NEW.km < t.departure_km THEN
        RAISE EXCEPTION 'the arrival reading is not below the departure reading' USING ERRCODE = 'check_violation', CONSTRAINT = 'transfer_arrival_km';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
