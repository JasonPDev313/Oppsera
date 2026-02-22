-- ACCT-CLOSE-01: Cash Drawer Hardening — Change Fund, Multi-Drop, Deposit Prep
-- Extends drawer sessions, cash drop events, and deposit slips with operational detail.

-- ── 1. drawer_sessions: change fund ────────────────────────────
ALTER TABLE drawer_sessions
  ADD COLUMN IF NOT EXISTS change_fund_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN drawer_sessions.change_fund_cents IS 'Starting cash float that is NOT revenue. Excluded from revenue calculations.';

-- ── 2. drawer_session_events: cash drop enhancements ───────────
ALTER TABLE drawer_session_events
  ADD COLUMN IF NOT EXISTS bag_id TEXT,
  ADD COLUMN IF NOT EXISTS seal_number TEXT,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_slip_id TEXT;

COMMENT ON COLUMN drawer_session_events.bag_id IS 'Physical bag or lockbox ID for cash drops';
COMMENT ON COLUMN drawer_session_events.seal_number IS 'Tamper-evident seal number for cash drops';
COMMENT ON COLUMN drawer_session_events.verified_by IS 'User who verified the sealed drop';
COMMENT ON COLUMN drawer_session_events.verified_at IS 'When verification of sealed drop occurred';
COMMENT ON COLUMN drawer_session_events.deposit_slip_id IS 'Links cash drop to a deposit slip';

-- Index for finding unlinked drops (deposit prep)
CREATE INDEX IF NOT EXISTS idx_drawer_events_deposit_slip
  ON drawer_session_events (tenant_id, deposit_slip_id)
  WHERE event_type = 'cash_drop';

-- ── 3. deposit_slips: operational detail ───────────────────────
ALTER TABLE deposit_slips
  ADD COLUMN IF NOT EXISTS denomination_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS slip_number TEXT,
  ADD COLUMN IF NOT EXISTS prepared_by TEXT,
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;

COMMENT ON COLUMN deposit_slips.denomination_breakdown IS 'Denomination count: { hundreds, fifties, twenties, tens, fives, ones, quarters, dimes, nickels, pennies }';
COMMENT ON COLUMN deposit_slips.slip_number IS 'Physical bank deposit slip number';
COMMENT ON COLUMN deposit_slips.prepared_by IS 'User who prepared the deposit';
COMMENT ON COLUMN deposit_slips.prepared_at IS 'When deposit was prepared';

-- ── 4. RLS policies for new columns ────────────────────────────
-- Existing RLS policies already cover SELECT/INSERT/UPDATE on both tables.
-- New columns inherit the same policies. No additional policies needed.
