-- Key rotation support (M2 plan §4.5): re-encrypting a number with a new key must also reach voided and locked
-- periods. The guard now allows exactly that change on them — the encryption columns only, with the masked hint
-- unchanged — and still refuses every other change. Additive; no row is changed by this migration.

CREATE OR REPLACE FUNCTION customer_documents_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  key_rotation_only boolean;
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.customer_id <> OLD.customer_id OR NEW.type <> OLD.type
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.renews_id IS DISTINCT FROM OLD.renews_id THEN
    RAISE EXCEPTION 'customer document identity columns cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_immutable';
  END IF;
  -- Same row apart from the ciphertext, its key id and the lookup hash with its key id.
  key_rotation_only := (to_jsonb(NEW) - ARRAY['number_ciphertext', 'number_key_id', 'number_lookup', 'number_lookup_key_id'])
                     = (to_jsonb(OLD) - ARRAY['number_ciphertext', 'number_key_id', 'number_lookup', 'number_lookup_key_id'])
                     AND (NEW.number_ciphertext IS NULL) = (OLD.number_ciphertext IS NULL);
  IF key_rotation_only THEN
    RETURN NEW;
  END IF;
  IF OLD.record_state = 'voided' THEN
    RAISE EXCEPTION 'a voided customer document cannot change' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_voided_final';
  END IF;
  IF OLD.locked_at IS NOT NULL AND (NEW.number_ciphertext IS DISTINCT FROM OLD.number_ciphertext OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
     OR NEW.valid_until IS DISTINCT FROM OLD.valid_until OR NEW.issuing_country IS DISTINCT FROM OLD.issuing_country) THEN
    RAISE EXCEPTION 'a locked customer document is renewed, not corrected' USING ERRCODE = 'check_violation', CONSTRAINT = 'customer_documents_locked';
  END IF;
  RETURN NEW;
END $$;
