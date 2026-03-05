-- KDS performance: composite index for the primary ticket polling query.
-- The KDS view polls every 3s per station with:
--   WHERE tenant_id = ? AND location_id = ? AND business_date = ? AND status IN ('pending', 'in_progress')
-- Without this index, Postgres does a sequential scan on high-volume days.
CREATE INDEX IF NOT EXISTS idx_fnb_kitchen_tickets_kds_poll
  ON fnb_kitchen_tickets (tenant_id, location_id, business_date, status)
  WHERE status IN ('pending', 'in_progress');
