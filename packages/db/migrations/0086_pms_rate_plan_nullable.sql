-- Make rate_plan_id nullable on pms_reservations (not every reservation needs a rate plan)
ALTER TABLE pms_reservations ALTER COLUMN rate_plan_id DROP NOT NULL;
