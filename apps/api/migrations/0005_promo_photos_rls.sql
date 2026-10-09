-- Files and vehicle promotional photos: company isolation, allowed values, runtime privileges.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['files', 'vehicle_promo_photos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id = app_company_id())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = app_company_id())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (company_id = app_company_id())', t || '_delete', t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('vehicle_promo_photo'));
--> statement-breakpoint
ALTER TABLE files ADD CONSTRAINT files_mime_check CHECK (mime_type IN ('image/webp'));
--> statement-breakpoint
ALTER TABLE files ADD CONSTRAINT files_size_check CHECK (size_bytes > 0 AND width > 0 AND height > 0);
--> statement-breakpoint
-- One photo per slot; checked at commit so reordering can swap positions inside a transaction.
ALTER TABLE vehicle_promo_photos ADD CONSTRAINT promo_photos_position_key UNIQUE (vehicle_id, position) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- Files are written once and never changed; promotional photos can be reordered and removed.
GRANT SELECT, INSERT, DELETE ON files TO acarvo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON vehicle_promo_photos TO acarvo_app;
