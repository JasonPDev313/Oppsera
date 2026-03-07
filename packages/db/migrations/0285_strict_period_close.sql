-- Add strict_period_close setting to accounting_settings.
-- When true, unmapped events, dead letters, unreconciled banks, and unposted
-- settlements are hard blockers on the close checklist. Default false for
-- backwards compatibility — existing tenants keep advisory-only behavior.

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS strict_period_close BOOLEAN NOT NULL DEFAULT false;
