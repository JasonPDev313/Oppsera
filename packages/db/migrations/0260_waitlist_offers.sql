-- ── Migration 0260: Waitlist Offer Tracking ───────────────────────────────────
-- Adds columns to fnb_waitlist_entries to track auto-promotion table offers.
-- When a table becomes available, the promoter sets offered_table_id + expiry.
-- The guest (or host) can accept or decline. Declined count is tracked so
-- repeated decliners are ranked lower in future promotions.

ALTER TABLE fnb_waitlist_entries ADD COLUMN IF NOT EXISTS offered_table_id TEXT;
ALTER TABLE fnb_waitlist_entries ADD COLUMN IF NOT EXISTS offered_at TIMESTAMPTZ;
ALTER TABLE fnb_waitlist_entries ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;
ALTER TABLE fnb_waitlist_entries ADD COLUMN IF NOT EXISTS offer_declined_count INTEGER NOT NULL DEFAULT 0;

-- Index: quickly find entries with an active offer for a given table
CREATE INDEX IF NOT EXISTS idx_waitlist_offered_table
  ON fnb_waitlist_entries (tenant_id, offered_table_id)
  WHERE offered_table_id IS NOT NULL;

-- Index: quickly find entries with pending / expired offers (for the expiry sweep)
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_expires
  ON fnb_waitlist_entries (tenant_id, offer_expires_at)
  WHERE offer_expires_at IS NOT NULL;
