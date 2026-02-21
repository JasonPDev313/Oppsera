-- Add default nightly rate to rate plans (fallback when no date-specific pricing exists)
ALTER TABLE pms_rate_plans ADD COLUMN IF NOT EXISTS default_nightly_rate_cents INTEGER;
