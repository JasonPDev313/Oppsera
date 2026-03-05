-- 0274: PMS calendar performance indexes
-- Partial composite index for calendar queries that filter on active reservation statuses
-- and date ranges. This covers the hot path in getCalendarWeek + getCalendarDay.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pms_reservations_calendar_active
  ON pms_reservations (tenant_id, property_id, check_in_date, check_out_date)
  WHERE status IN ('HOLD', 'CONFIRMED', 'CHECKED_IN');

-- Descending index for listReservations pagination (ORDER BY check_in_date DESC, id DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pms_reservations_list_desc
  ON pms_reservations (tenant_id, property_id, check_in_date DESC, id DESC);
