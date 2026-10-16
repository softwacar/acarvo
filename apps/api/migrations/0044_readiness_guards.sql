-- Operational readiness V1 (docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md), test database only so far: company
-- isolation of the new tables, repair transport evidence, four-eyes release of damage blocks, FN5 correction of a
-- finance file's responsible party (only without financial movements), transfer evidence photos, runtime privileges.
-- Existing rows are not changed; earlier migration files are not edited.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transfer_photos', 'damage_block_release_requests', 'finance_responsible_corrections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE files DROP CONSTRAINT files_kind_check;
--> statement-breakpoint
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('vehicle_promo_photo', 'rental_inspection_photo', 'maintenance_photo', 'damage_photo', 'transfer_photo'));
--> statement-breakpoint

-- Any financial movement on a file: a line, a payment, a deposit or a deposit return, in any state (also rejected or
-- reversed ones: they are part of the file's history).
CREATE OR REPLACE FUNCTION finance_file_has_movement(company uuid, finance uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM finance_charges WHERE company_id = company AND finance_id = finance)
      OR EXISTS (SELECT 1 FROM finance_payments WHERE company_id = company AND finance_id = finance)
      OR EXISTS (SELECT 1 FROM finance_deposits WHERE company_id = company AND finance_id = finance) $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION rental_finances_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE k record; posted bigint; paid bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a finance file starts open' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_lifecycle';
    END IF;
    SELECT customer_id, corporate_account_id INTO k FROM rentals WHERE company_id = NEW.company_id AND id = NEW.rental_id;
    IF (NEW.responsible_type = 'customer' AND NEW.responsible_customer_id IS DISTINCT FROM k.customer_id)
       OR (NEW.responsible_type = 'corporate' AND NEW.responsible_corporate_id IS DISTINCT FROM k.corporate_account_id) THEN
      RAISE EXCEPTION 'the responsible party is the rental''s customer or corporate account' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_responsible';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.rental_id <> OLD.rental_id OR NEW.currency <> OLD.currency
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'finance file identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_immutable';
  END IF;
  -- FN5: the responsible party changes only through a correction applied in this same transaction by a second person,
  -- only while the file is open and has no financial movement, and only to the rental's own customer or account.
  IF NEW.responsible_type <> OLD.responsible_type OR NEW.responsible_customer_id IS DISTINCT FROM OLD.responsible_customer_id
     OR NEW.responsible_corporate_id IS DISTINCT FROM OLD.responsible_corporate_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM finance_responsible_corrections c
      WHERE c.company_id = NEW.company_id AND c.finance_id = NEW.id AND c.status = 'applied' AND c.decided_at = now() AND c.decided_by <> c.requested_by
        AND c.from_type = OLD.responsible_type AND c.from_customer_id IS NOT DISTINCT FROM OLD.responsible_customer_id AND c.from_corporate_id IS NOT DISTINCT FROM OLD.responsible_corporate_id
        AND c.to_type = NEW.responsible_type AND c.to_customer_id IS NOT DISTINCT FROM NEW.responsible_customer_id AND c.to_corporate_id IS NOT DISTINCT FROM NEW.responsible_corporate_id
    ) THEN
      RAISE EXCEPTION 'finance file identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_immutable';
    END IF;
    IF OLD.status = 'closed' OR finance_file_has_movement(NEW.company_id, NEW.id) THEN
      RAISE EXCEPTION 'the responsible party of a file with financial movements is not corrected in place' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_correction_movement';
    END IF;
    SELECT customer_id, corporate_account_id INTO k FROM rentals WHERE company_id = NEW.company_id AND id = NEW.rental_id;
    IF (NEW.responsible_type = 'customer' AND NEW.responsible_customer_id IS DISTINCT FROM k.customer_id)
       OR (NEW.responsible_type = 'corporate' AND NEW.responsible_corporate_id IS DISTINCT FROM k.corporate_account_id) THEN
      RAISE EXCEPTION 'the responsible party is the rental''s customer or corporate account' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_responsible';
    END IF;
  END IF;
  IF NOT (NEW.status = OLD.status OR (OLD.status IN ('open', 'reopened') AND NEW.status = 'closed') OR (OLD.status = 'closed' AND NEW.status = 'reopened')) THEN
    RAISE EXCEPTION 'finance file status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_lifecycle';
  END IF;
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    IF EXISTS (SELECT 1 FROM finance_charges WHERE company_id = NEW.company_id AND finance_id = NEW.id AND status IN ('pending', 'reversal_requested'))
       OR EXISTS (SELECT 1 FROM finance_payments WHERE company_id = NEW.company_id AND finance_id = NEW.id AND status = 'recorded')
       OR EXISTS (SELECT 1 FROM finance_deposits WHERE company_id = NEW.company_id AND finance_id = NEW.id AND (status IN ('requested', 'reported') OR in_review))
       OR EXISTS (SELECT 1 FROM finance_deposit_refunds r JOIN finance_deposits d ON d.company_id = r.company_id AND d.id = r.deposit_id
                  WHERE d.company_id = NEW.company_id AND d.finance_id = NEW.id AND r.status IN ('requested', 'approved'))
       OR EXISTS (SELECT 1 FROM finance_deposits d WHERE d.company_id = NEW.company_id AND d.finance_id = NEW.id AND d.status = 'verified'
                  AND d.amount_minor > coalesce((SELECT sum(r.amount_minor) FROM finance_deposit_refunds r WHERE r.company_id = d.company_id AND r.deposit_id = d.id AND r.status = 'completed'), 0)) THEN
      RAISE EXCEPTION 'a finance file with pending items or deposits cannot be closed' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_close_pending';
    END IF;
    SELECT coalesce(sum(amount_minor), 0) INTO posted FROM finance_charges WHERE company_id = NEW.company_id AND finance_id = NEW.id AND status = 'posted';
    -- A file without any posted line was never priced in ACARVO: a zero balance there is not a settled account.
    IF NOT EXISTS (SELECT 1 FROM finance_charges WHERE company_id = NEW.company_id AND finance_id = NEW.id AND status = 'posted') THEN
      RAISE EXCEPTION 'a finance file without a posted line cannot be closed' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_close_unpriced';
    END IF;
    SELECT coalesce(sum(amount_minor), 0) INTO paid FROM finance_payments WHERE company_id = NEW.company_id AND finance_id = NEW.id AND status = 'verified';
    IF posted <> paid THEN
      RAISE EXCEPTION 'a finance file closes only with a zero balance' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_close_balance';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- A correction request starts from the file's current party, names another party of the same rental, and only exists
-- while the file is open and has no movement. requested -> applied | rejected (by a second person) | cancelled (by the
-- requester); final states never change.
CREATE OR REPLACE FUNCTION finance_responsible_corrections_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE f record;
DECLARE k record;
BEGIN
  SELECT * INTO f FROM rental_finances WHERE company_id = NEW.company_id AND id = NEW.finance_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'a correction starts as requested' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_lifecycle';
    END IF;
    IF NEW.from_type IS DISTINCT FROM f.responsible_type OR NEW.from_customer_id IS DISTINCT FROM f.responsible_customer_id OR NEW.from_corporate_id IS DISTINCT FROM f.responsible_corporate_id THEN
      RAISE EXCEPTION 'a correction starts from the file''s current party' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_from';
    END IF;
    IF NEW.to_type = NEW.from_type AND NEW.to_customer_id IS NOT DISTINCT FROM NEW.from_customer_id AND NEW.to_corporate_id IS NOT DISTINCT FROM NEW.from_corporate_id THEN
      RAISE EXCEPTION 'a correction names another party' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_same';
    END IF;
    SELECT customer_id, corporate_account_id INTO k FROM rentals WHERE company_id = NEW.company_id AND id = f.rental_id;
    IF (NEW.to_type = 'customer' AND NEW.to_customer_id IS DISTINCT FROM k.customer_id) OR (NEW.to_type = 'corporate' AND NEW.to_corporate_id IS DISTINCT FROM k.corporate_account_id) THEN
      RAISE EXCEPTION 'the new party is the rental''s customer or corporate account' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_responsible';
    END IF;
  ELSE
    IF NEW.company_id <> OLD.company_id OR NEW.finance_id <> OLD.finance_id OR NEW.from_type <> OLD.from_type OR NEW.from_customer_id IS DISTINCT FROM OLD.from_customer_id
       OR NEW.from_corporate_id IS DISTINCT FROM OLD.from_corporate_id OR NEW.to_type <> OLD.to_type OR NEW.to_customer_id IS DISTINCT FROM OLD.to_customer_id
       OR NEW.to_corporate_id IS DISTINCT FROM OLD.to_corporate_id OR NEW.reason <> OLD.reason OR NEW.requested_by <> OLD.requested_by OR NEW.requested_at <> OLD.requested_at
       OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN
      RAISE EXCEPTION 'correction identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_immutable';
    END IF;
    IF OLD.status <> 'requested' THEN
      RAISE EXCEPTION 'a decided correction cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_final';
    END IF;
    IF NEW.status = 'cancelled' AND NEW.decided_by IS DISTINCT FROM NEW.requested_by THEN
      RAISE EXCEPTION 'only the requester cancels a correction' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_four_eyes';
    END IF;
    IF NEW.status IN ('applied', 'rejected') AND (NEW.decided_by IS NULL OR NEW.decided_by = NEW.requested_by) THEN
      RAISE EXCEPTION 'a correction is decided by a second person' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_responsible_corrections_four_eyes';
    END IF;
  END IF;
  IF NEW.status IN ('requested', 'applied') AND (f.status = 'closed' OR finance_file_has_movement(NEW.company_id, NEW.finance_id)) THEN
    RAISE EXCEPTION 'the responsible party of a file with financial movements is not corrected in place' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_correction_movement';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_responsible_corrections_guard BEFORE INSERT OR UPDATE ON finance_responsible_corrections FOR EACH ROW EXECUTE FUNCTION finance_responsible_corrections_guard();
--> statement-breakpoint

-- A release request is for an open block of an open damage file; requested -> approved | rejected (second person) |
-- cancelled (requester); final states never change.
CREATE OR REPLACE FUNCTION damage_block_release_requests_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'a release starts as requested' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_lifecycle';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM damage_blocks b JOIN damage_files d ON d.company_id = b.company_id AND d.id = b.damage_id
      WHERE b.company_id = NEW.company_id AND b.id = NEW.block_id AND b.damage_id = NEW.damage_id AND b.ended_at IS NULL AND d.review_status <> 'closed'
    ) THEN
      RAISE EXCEPTION 'a release is for an open block of an open damage file' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_block';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.damage_id <> OLD.damage_id OR NEW.block_id <> OLD.block_id OR NEW.reason <> OLD.reason OR NEW.usability <> OLD.usability
     OR NEW.requested_by <> OLD.requested_by OR NEW.requested_at <> OLD.requested_at OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN
    RAISE EXCEPTION 'release identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_immutable';
  END IF;
  IF OLD.status <> 'requested' THEN
    RAISE EXCEPTION 'a decided release cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_final';
  END IF;
  IF NEW.status = 'cancelled' AND NEW.decided_by IS DISTINCT FROM NEW.requested_by THEN
    RAISE EXCEPTION 'only the requester cancels a release' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_four_eyes';
  END IF;
  IF NEW.status IN ('approved', 'rejected') AND (NEW.decided_by IS NULL OR NEW.decided_by = NEW.requested_by) THEN
    RAISE EXCEPTION 'a release is decided by a second person' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_four_eyes';
  END IF;
  IF NEW.status = 'approved' AND NOT EXISTS (SELECT 1 FROM damage_blocks b WHERE b.company_id = NEW.company_id AND b.id = NEW.block_id AND b.ended_at IS NULL) THEN
    RAISE EXCEPTION 'the block is no longer open' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_block_release_requests_block';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER damage_block_release_requests_guard BEFORE INSERT OR UPDATE ON damage_block_release_requests FOR EACH ROW EXECUTE FUNCTION damage_block_release_requests_guard();
--> statement-breakpoint

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
  IF NEW.ended_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM damage_block_release_requests r
    WHERE r.company_id = NEW.company_id AND r.block_id = NEW.id AND r.status = 'approved' AND r.decided_at = now()
      AND r.decided_by = NEW.ended_by AND r.requested_by <> NEW.ended_by
  ) THEN
    RAISE EXCEPTION 'a damage block is lifted only with a release approved by a second person' USING ERRCODE = 'check_violation', CONSTRAINT = 'damage_blocks_four_eyes';
  END IF;
  PERFORM vehicle_allocation_lock(NEW.company_id, NEW.vehicle_id);
  RETURN NEW;
END $$;
--> statement-breakpoint

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
    IF NEW.purpose = 'repair' AND (coalesce(btrim(NEW.carrier_name), '') = '' OR coalesce(btrim(NEW.transport_reference), '') = '') THEN
      RAISE EXCEPTION 'a repair transport records its carrier and the carrier''s reference' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_carrier_required';
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
     OR NEW.purpose <> OLD.purpose OR NEW.damage_file_id IS DISTINCT FROM OLD.damage_file_id OR NEW.transport_method IS DISTINCT FROM OLD.transport_method
     OR NEW.carrier_name IS DISTINCT FROM OLD.carrier_name OR NEW.transport_reference IS DISTINCT FROM OLD.transport_reference THEN
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
--> statement-breakpoint

-- Transport evidence photos: only for a repair transport that is not finished or cancelled (at most 10 active);
-- removal is a mark.
CREATE OR REPLACE FUNCTION transfer_photos_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicle_transfers t WHERE t.company_id = NEW.company_id AND t.id = NEW.transfer_id AND t.purpose = 'repair' AND t.status IN ('requested', 'approved', 'in_transit')) THEN
    RAISE EXCEPTION 'photos change only on an open repair transport' USING ERRCODE = 'check_violation', CONSTRAINT = 'transfer_photos_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.transfer_id <> OLD.transfer_id OR NEW.file_id <> OLD.file_id
       OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by OR OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a transfer photo only gets a removal mark' USING ERRCODE = 'check_violation', CONSTRAINT = 'transfer_photos_immutable';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('transfer-photos:' || NEW.transfer_id::text, 0));
  SELECT count(*) INTO n FROM transfer_photos p WHERE p.company_id = NEW.company_id AND p.transfer_id = NEW.transfer_id AND p.removed_at IS NULL;
  IF n >= 10 THEN
    RAISE EXCEPTION 'a transfer has at most 10 photos' USING ERRCODE = 'check_violation', CONSTRAINT = 'transfer_photos_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transfer_photos_guard BEFORE INSERT OR UPDATE ON transfer_photos FOR EACH ROW EXECUTE FUNCTION transfer_photos_guard();
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transfer_photos', 'damage_block_release_requests', 'finance_responsible_corrections'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION operations_history_guard()', t || '_no_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON transfer_photos, damage_block_release_requests, finance_responsible_corrections TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION finance_file_has_movement(uuid, uuid), finance_responsible_corrections_guard(), damage_block_release_requests_guard(), transfer_photos_guard() TO acarvo_app;
