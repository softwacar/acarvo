-- Finance V1: company isolation, lifecycles, four-eyes checks, balance and refund limits, immutability and runtime
-- privileges (docs/FINANS_YONETIMI_V1_PLANI.md). Additive: no existing table or row changes. Internal records only:
-- nothing here moves money; amounts, currencies and parties never change and nothing is ever deleted.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rental_finances', 'finance_charges', 'finance_payments', 'finance_deposits', 'finance_deposit_refunds', 'finance_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Finance file: the responsible party is the rental's own customer or corporate account; currency and party never
-- change; open -> closed -> reopened -> closed. A file closes only when nothing is pending, the posted lines and the
-- verified payments are equal, and every deposit is resolved (refunded in full or never held, none under review).
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
  IF NEW.company_id <> OLD.company_id OR NEW.rental_id <> OLD.rental_id OR NEW.currency <> OLD.currency OR NEW.responsible_type <> OLD.responsible_type
     OR NEW.responsible_customer_id IS DISTINCT FROM OLD.responsible_customer_id OR NEW.responsible_corporate_id IS DISTINCT FROM OLD.responsible_corporate_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'finance file identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_immutable';
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
    SELECT coalesce(sum(amount_minor), 0) INTO paid FROM finance_payments WHERE company_id = NEW.company_id AND finance_id = NEW.id AND status = 'verified';
    IF posted <> paid THEN
      RAISE EXCEPTION 'a finance file closes only with a zero balance' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_close_balance';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rental_finances_guard BEFORE INSERT OR UPDATE ON rental_finances FOR EACH ROW EXECUTE FUNCTION rental_finances_guard();
--> statement-breakpoint

-- Changes under a file need it open (a closed file is reopened with a reason first). Returns the file, locked: every
-- money change of one rental is serialised on this row.
CREATE OR REPLACE FUNCTION finance_open_file(p_company uuid, p_finance uuid) RETURNS rental_finances
  LANGUAGE plpgsql AS $$
DECLARE f rental_finances;
BEGIN
  SELECT * INTO f FROM rental_finances WHERE company_id = p_company AND id = p_finance FOR UPDATE;
  IF f.status = 'closed' THEN
    RAISE EXCEPTION 'the finance file is closed' USING ERRCODE = 'check_violation', CONSTRAINT = 'rental_finances_closed';
  END IF;
  RETURN f;
END $$;
--> statement-breakpoint

-- Internal account lines: made from a current quote of this rental (once per quote) or entered manually with a reason;
-- pending -> posted (another person, only once the rental was delivered: spec §67) or rejected; posted -> reversal
-- requested -> reversed (another person) or back to posted. Amounts never change.
CREATE OR REPLACE FUNCTION finance_charges_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE f rental_finances; q record; k record;
BEGIN
  f := finance_open_file(NEW.company_id, NEW.finance_id);
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.approved_at IS NOT NULL OR NEW.reversal_requested_at IS NOT NULL THEN
      RAISE EXCEPTION 'a charge starts pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_lifecycle';
    END IF;
    IF NEW.currency <> f.currency THEN
      RAISE EXCEPTION 'a charge is in the file currency' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_currency';
    END IF;
    IF NEW.kind = 'manual' AND (NEW.reason IS NULL OR char_length(NEW.reason) < 3) THEN
      RAISE EXCEPTION 'a manual charge has a reason' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_reason';
    END IF;
    IF NEW.kind = 'quote' THEN
      SELECT * INTO k FROM rentals WHERE company_id = NEW.company_id AND id = f.rental_id;
      SELECT * INTO q FROM price_quotes WHERE company_id = NEW.company_id AND id = NEW.quote_id;
      IF q.status <> 'quoted' OR q.currency <> f.currency
         OR NOT (q.rental_id = k.id OR (k.reservation_id IS NOT NULL AND q.reservation_id = k.reservation_id))
         OR q.pickup_at <> k.planned_pickup_at OR q.return_at <> k.planned_return_at OR q.vehicle_class_id <> k.vehicle_class_id
         OR NEW.net_minor <> q.net_minor OR NEW.tax_minor IS DISTINCT FROM q.tax_minor OR NEW.tax_status <> q.tax_status
         OR NEW.amount_minor <> coalesce(q.gross_minor, q.net_minor) THEN
        RAISE EXCEPTION 'a quote line copies a current quote of this rental' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_quote';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.finance_id <> OLD.finance_id OR NEW.charge_no <> OLD.charge_no OR NEW.kind <> OLD.kind
     OR NEW.quote_id IS DISTINCT FROM OLD.quote_id OR NEW.description <> OLD.description OR NEW.currency <> OLD.currency
     OR NEW.amount_minor <> OLD.amount_minor OR NEW.net_minor <> OLD.net_minor OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
     OR NEW.tax_status <> OLD.tax_status OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.client_request_id <> OLD.client_request_id
     OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'charge amounts and sources cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_immutable';
  END IF;
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'pending' AND NEW.status IN ('posted', 'rejected'))
          OR (OLD.status = 'posted' AND NEW.status = 'reversal_requested')
          OR (OLD.status = 'reversal_requested' AND NEW.status IN ('reversed', 'posted'))) THEN
    RAISE EXCEPTION 'charge status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_lifecycle';
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'posted' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'a posted charge has an approver' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_four_eyes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rentals WHERE company_id = NEW.company_id AND id = f.rental_id AND status IN ('delivered', 'returned', 'closed')) THEN
      RAISE EXCEPTION 'charges are posted once the vehicle was handed over' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_delivered';
    END IF;
  ELSIF OLD.approved_by IS DISTINCT FROM NEW.approved_by OR OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
    RAISE EXCEPTION 'the approval cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_immutable';
  END IF;
  IF NEW.status = 'reversal_requested' AND (NEW.reversal_reason IS NULL OR char_length(NEW.reversal_reason) < 3 OR NEW.reversal_requested_by IS NULL) THEN
    RAISE EXCEPTION 'a reversal request has a reason and a requester' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_reversal';
  END IF;
  IF NEW.status = 'reversed' AND (NEW.reversed_by IS NULL OR NEW.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'a reversal has an approver' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_charges_reversal_four_eyes';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_charges_guard BEFORE INSERT OR UPDATE ON finance_charges FOR EACH ROW EXECUTE FUNCTION finance_charges_guard();
--> statement-breakpoint

-- Payments: recorded (a staff statement) -> verified by another person (then it counts) or rejected; verified ->
-- reversed with a reason. Only in the file currency (no exchange rates in V1). No overpayment: recorded and verified
-- payments never exceed the open and posted lines (spec §64.1).
CREATE OR REPLACE FUNCTION finance_payments_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE f rental_finances; charged bigint; paid bigint;
BEGIN
  f := finance_open_file(NEW.company_id, NEW.finance_id);
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'recorded' OR NEW.verified_at IS NOT NULL OR NEW.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a payment starts as recorded' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_lifecycle';
    END IF;
    IF NEW.currency <> f.currency THEN
      RAISE EXCEPTION 'a payment is in the file currency' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_currency';
    END IF;
    SELECT coalesce(sum(amount_minor), 0) INTO charged FROM finance_charges WHERE company_id = NEW.company_id AND finance_id = NEW.finance_id AND status IN ('pending', 'posted', 'reversal_requested');
    SELECT coalesce(sum(amount_minor), 0) INTO paid FROM finance_payments WHERE company_id = NEW.company_id AND finance_id = NEW.finance_id AND status IN ('recorded', 'verified');
    IF paid + NEW.amount_minor > charged THEN
      RAISE EXCEPTION 'payments cannot exceed the account lines' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_overpayment';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.finance_id <> OLD.finance_id OR NEW.payment_no <> OLD.payment_no OR NEW.method <> OLD.method
     OR NEW.currency <> OLD.currency OR NEW.amount_minor <> OLD.amount_minor OR NEW.payer_type <> OLD.payer_type
     OR NEW.payer_customer_id IS DISTINCT FROM OLD.payer_customer_id OR NEW.payer_corporate_id IS DISTINCT FROM OLD.payer_corporate_id
     OR NEW.payer_name IS DISTINCT FROM OLD.payer_name OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
     OR NEW.received_at <> OLD.received_at OR NEW.branch_id <> OLD.branch_id OR NEW.note IS DISTINCT FROM OLD.note OR NEW.cash_ack <> OLD.cash_ack
     OR NEW.client_request_id <> OLD.client_request_id OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'payment details cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_immutable';
  END IF;
  IF NOT (NEW.status = OLD.status OR (OLD.status = 'recorded' AND NEW.status IN ('verified', 'rejected')) OR (OLD.status = 'verified' AND NEW.status = 'reversed')) THEN
    RAISE EXCEPTION 'payment status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_lifecycle';
  END IF;
  IF NEW.status = 'verified' AND OLD.status = 'recorded' AND (NEW.verified_by IS NULL OR NEW.verified_at IS NULL) THEN
    RAISE EXCEPTION 'a verified payment has a verifier' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_four_eyes';
  END IF;
  IF OLD.status <> 'recorded' AND (OLD.verified_by IS DISTINCT FROM NEW.verified_by OR OLD.verified_at IS DISTINCT FROM NEW.verified_at) THEN
    RAISE EXCEPTION 'the verification cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_immutable';
  END IF;
  IF NEW.status = 'reversed' AND (NEW.reversal_reason IS NULL OR char_length(NEW.reversal_reason) < 3 OR NEW.reversed_by IS NULL OR NEW.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'a reversal has a reason and an actor' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_payments_reversal';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_payments_guard BEFORE INSERT OR UPDATE ON finance_payments FOR EACH ROW EXECUTE FUNCTION finance_payments_guard();
--> statement-breakpoint

-- Deposits: requested -> reported (method, reference, reporter) -> verified by another person, or rejected;
-- requested -> cancelled. A verified deposit may be marked "under review" (dispute) and cleared again. Amount, currency
-- and how it was received never change. Never a payment, never revenue, never an automatic deduction.
CREATE OR REPLACE FUNCTION finance_deposits_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE f rental_finances;
BEGIN
  f := finance_open_file(NEW.company_id, NEW.finance_id);
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('requested', 'reported') OR NEW.verified_at IS NOT NULL OR NEW.in_review THEN
      RAISE EXCEPTION 'a deposit starts as requested or reported' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_lifecycle';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.finance_id <> OLD.finance_id OR NEW.deposit_no <> OLD.deposit_no OR NEW.currency <> OLD.currency
     OR NEW.amount_minor <> OLD.amount_minor OR NEW.branch_id <> OLD.branch_id OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.client_request_id <> OLD.client_request_id OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'deposit amount and identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_immutable';
  END IF;
  IF OLD.status <> 'requested' AND (NEW.method IS DISTINCT FROM OLD.method OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
     OR NEW.cash_ack <> OLD.cash_ack OR NEW.reported_at IS DISTINCT FROM OLD.reported_at OR NEW.reported_by IS DISTINCT FROM OLD.reported_by) THEN
    RAISE EXCEPTION 'how a deposit was received cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_immutable';
  END IF;
  IF NOT (NEW.status = OLD.status OR (OLD.status = 'requested' AND NEW.status IN ('reported', 'cancelled')) OR (OLD.status = 'reported' AND NEW.status IN ('verified', 'rejected'))) THEN
    RAISE EXCEPTION 'deposit status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_lifecycle';
  END IF;
  IF NEW.status = 'verified' AND OLD.status = 'reported' AND (NEW.verified_by IS NULL OR NEW.verified_at IS NULL) THEN
    RAISE EXCEPTION 'a verified deposit has a verifier' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_four_eyes';
  END IF;
  IF OLD.status = 'verified' AND (OLD.verified_by IS DISTINCT FROM NEW.verified_by OR OLD.verified_at IS DISTINCT FROM NEW.verified_at) THEN
    RAISE EXCEPTION 'the verification cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_immutable';
  END IF;
  IF NEW.in_review AND NEW.status <> 'verified' THEN
    RAISE EXCEPTION 'only a held deposit can be under review' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposits_review';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_deposits_guard BEFORE INSERT OR UPDATE ON finance_deposits FOR EACH ROW EXECUTE FUNCTION finance_deposits_guard();
--> statement-breakpoint

-- Deposit returns: requested -> approved by another person -> completed (the staff report that the money went back
-- outside ACARVO) or cancelled/rejected; completed -> reversed with a reason. Open, approved and completed returns
-- never exceed the verified deposit; the deposit row is locked so two concurrent returns cannot both pass. Nothing
-- moves while the deposit is under review.
CREATE OR REPLACE FUNCTION finance_deposit_refunds_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE d finance_deposits; f rental_finances; used bigint;
BEGIN
  SELECT * INTO d FROM finance_deposits WHERE company_id = NEW.company_id AND id = NEW.deposit_id FOR UPDATE;
  f := finance_open_file(d.company_id, d.finance_id);
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' OR NEW.approved_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a deposit return starts as requested' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_lifecycle';
    END IF;
    IF d.status <> 'verified' THEN
      RAISE EXCEPTION 'only a verified deposit is returned' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_not_held';
    END IF;
    IF NEW.currency <> d.currency THEN
      RAISE EXCEPTION 'a return is in the deposit currency' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_currency';
    END IF;
  ELSE
    IF NEW.company_id <> OLD.company_id OR NEW.deposit_id <> OLD.deposit_id OR NEW.refund_no <> OLD.refund_no OR NEW.currency <> OLD.currency
       OR NEW.amount_minor <> OLD.amount_minor OR NEW.method <> OLD.method OR NEW.reason <> OLD.reason
       OR NEW.client_request_id <> OLD.client_request_id OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
      RAISE EXCEPTION 'return amount and identity cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_immutable';
    END IF;
    IF NOT (NEW.status = OLD.status
            OR (OLD.status = 'requested' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
            OR (OLD.status = 'approved' AND NEW.status IN ('completed', 'cancelled'))
            OR (OLD.status = 'completed' AND NEW.status = 'reversed')) THEN
      RAISE EXCEPTION 'return status cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_lifecycle';
    END IF;
    IF OLD.status <> 'requested' AND (OLD.approved_by IS DISTINCT FROM NEW.approved_by OR OLD.approved_at IS DISTINCT FROM NEW.approved_at) THEN
      RAISE EXCEPTION 'the approval cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_immutable';
    END IF;
    IF OLD.status IN ('completed', 'reversed') AND (OLD.completed_by IS DISTINCT FROM NEW.completed_by OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
       OR OLD.external_reference IS DISTINCT FROM NEW.external_reference OR OLD.cash_ack <> NEW.cash_ack) THEN
      RAISE EXCEPTION 'the completion report cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_immutable';
    END IF;
    IF NEW.status = 'approved' AND OLD.status = 'requested' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
      RAISE EXCEPTION 'an approved return has an approver' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_four_eyes';
    END IF;
    IF NEW.status = 'completed' AND OLD.status = 'approved' AND NEW.method <> 'cash' AND NEW.external_reference IS NULL THEN
      RAISE EXCEPTION 'a non-cash return has an external reference' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_reference';
    END IF;
    IF NEW.status = 'reversed' AND (NEW.reversal_reason IS NULL OR char_length(NEW.reversal_reason) < 3 OR NEW.reversed_by IS NULL OR NEW.reversed_at IS NULL) THEN
      RAISE EXCEPTION 'a reversal has a reason and an actor' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_reversal';
    END IF;
  END IF;
  IF d.in_review AND (TG_OP = 'INSERT' OR (NEW.status IN ('approved', 'completed') AND NEW.status <> OLD.status)) THEN
    RAISE EXCEPTION 'a deposit under review is not returned' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_review';
  END IF;
  IF NEW.status IN ('requested', 'approved', 'completed') THEN
    SELECT coalesce(sum(amount_minor), 0) INTO used FROM finance_deposit_refunds
      WHERE company_id = NEW.company_id AND deposit_id = NEW.deposit_id AND status IN ('requested', 'approved', 'completed') AND id <> NEW.id;
    IF used + NEW.amount_minor > d.amount_minor THEN
      RAISE EXCEPTION 'returns cannot exceed the deposit' USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_deposit_refunds_exceed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_deposit_refunds_guard BEFORE INSERT OR UPDATE ON finance_deposit_refunds FOR EACH ROW EXECUTE FUNCTION finance_deposit_refunds_guard();
--> statement-breakpoint

-- History is kept for every role: events never change; no finance record is ever deleted (TRUNCATE in the test reset
-- is unaffected).
CREATE OR REPLACE FUNCTION finance_history_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are kept as history: % is not allowed', TG_TABLE_NAME, lower(TG_OP) USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_history';
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_events_history BEFORE UPDATE OR DELETE ON finance_events FOR EACH ROW EXECUTE FUNCTION finance_history_guard();
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rental_finances', 'finance_charges', 'finance_payments', 'finance_deposits', 'finance_deposit_refunds'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_history_guard()', t || '_no_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Runtime privileges: nothing is deleted; events are append-only.
GRANT SELECT, INSERT, UPDATE ON rental_finances, finance_charges, finance_payments, finance_deposits, finance_deposit_refunds TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON finance_events TO acarvo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rental_finances_guard(), finance_open_file(uuid, uuid), finance_charges_guard(), finance_payments_guard(), finance_deposits_guard(), finance_deposit_refunds_guard(), finance_history_guard() TO acarvo_app;
