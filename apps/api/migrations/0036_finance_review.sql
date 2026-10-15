-- Finance V1 integration review: a file closes only after at least one posted line (an unpriced file is never shown
-- as settled at zero), and reversals of payments and deposit returns need a second person (four-eyes).
ALTER TABLE "finance_deposit_refunds" ADD CONSTRAINT "finance_deposit_refunds_reversal_four_eyes" CHECK ("finance_deposit_refunds"."reversed_by" is null or "finance_deposit_refunds"."reversed_by" <> "finance_deposit_refunds"."completed_by");--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_reversal_four_eyes" CHECK ("finance_payments"."reversed_by" is null or "finance_payments"."reversed_by" <> "finance_payments"."created_by");
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
