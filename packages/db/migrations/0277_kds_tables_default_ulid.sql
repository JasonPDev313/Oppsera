-- Add DEFAULT gen_ulid() to KDS tables from migration 0209 that were
-- missing it, matching the convention used by every other table.
-- Without the default, raw SQL INSERTs that omit `id` hit a NOT NULL violation.

ALTER TABLE fnb_kds_bump_bar_profiles
  ALTER COLUMN id SET DEFAULT gen_ulid();

ALTER TABLE fnb_kds_alert_profiles
  ALTER COLUMN id SET DEFAULT gen_ulid();

ALTER TABLE fnb_kds_performance_targets
  ALTER COLUMN id SET DEFAULT gen_ulid();

ALTER TABLE fnb_kds_item_prep_times
  ALTER COLUMN id SET DEFAULT gen_ulid();
