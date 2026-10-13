-- Pricing and contracts V1: history is kept even against privileged roles. The runtime role already has no UPDATE or
-- DELETE on these tables (0032); these triggers make revisions, their parts, quotes, templates, contracts, files and
-- events undeletable and the append-only ones unchangeable for every role (TRUNCATE in the test reset is unaffected).
CREATE OR REPLACE FUNCTION pricing_contracts_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are kept as history: % is not allowed', TG_TABLE_NAME, lower(TG_OP) USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_history';
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_list_revisions', 'price_list_rates', 'price_list_seasons', 'price_list_extras', 'price_list_discounts',
                           'contract_templates', 'contract_files', 'contract_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION pricing_contracts_append_only()', t || '_history', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['price_lists', 'price_quotes', 'contract_template_versions', 'contracts'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION pricing_contracts_append_only()', t || '_no_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION pricing_contracts_append_only() TO acarvo_app;
