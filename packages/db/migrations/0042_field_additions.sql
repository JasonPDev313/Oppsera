-- Migration: 0042_field_additions
-- Cross-cutting ALTER TABLE additions for locations

ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS social_links jsonb;
