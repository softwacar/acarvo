-- A repair transport leaves only with its carrier and the carrier's reference recorded (docs/OPERASYONEL_HAZIRLIK_DASHBOARD_RAPORU.md).
-- New repair transports already require both on insert (0044) and they never change; this also covers a repair transport
-- requested before that rule: it cannot depart until a new, complete request replaces it. Existing rows are not changed.
CREATE OR REPLACE FUNCTION vehicle_transfers_repair_departure() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.purpose = 'repair' AND NEW.status = 'in_transit' AND OLD.status IS DISTINCT FROM 'in_transit'
     AND (coalesce(btrim(NEW.carrier_name), '') = '' OR coalesce(btrim(NEW.transport_reference), '') = '') THEN
    RAISE EXCEPTION 'a repair transport departs only with its carrier and the carrier''s reference' USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_transfers_carrier_required';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER vehicle_transfers_repair_departure BEFORE UPDATE ON vehicle_transfers FOR EACH ROW EXECUTE FUNCTION vehicle_transfers_repair_departure();
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION vehicle_transfers_repair_departure() TO acarvo_app;
