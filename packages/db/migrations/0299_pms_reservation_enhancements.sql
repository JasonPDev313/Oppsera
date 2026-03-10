-- Add new columns to pms_reservations for reservation screen enhancements
-- Quick Wins: eta, special_requests, do_not_move
-- Medium Effort: market_segment, vehicle_json

ALTER TABLE pms_reservations
  ADD COLUMN IF NOT EXISTS eta TEXT,
  ADD COLUMN IF NOT EXISTS special_requests TEXT,
  ADD COLUMN IF NOT EXISTS do_not_move BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS market_segment TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_json JSONB;

-- Index on market_segment for revenue reporting queries
CREATE INDEX IF NOT EXISTS idx_pms_reservations_market_segment
  ON pms_reservations (tenant_id, property_id, market_segment)
  WHERE market_segment IS NOT NULL;
