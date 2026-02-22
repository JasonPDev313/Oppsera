-- Session 37: Add legacy GL posting gate to accounting settings.
-- When true (default for existing tenants), the legacy payment_journal_entries
-- system remains active alongside the proper GL engine.
-- Set to false to disable legacy posting and rely solely on the new GL pipeline.
ALTER TABLE accounting_settings
  ADD COLUMN enable_legacy_gl_posting BOOLEAN NOT NULL DEFAULT true;
