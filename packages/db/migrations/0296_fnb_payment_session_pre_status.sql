-- Add pre_payment_tab_status to fnb_payment_sessions
-- Stores the tab status before transitioning to 'paying', so fail-payment-session
-- can restore the correct status instead of hardcoding 'open'.
ALTER TABLE fnb_payment_sessions
  ADD COLUMN IF NOT EXISTS pre_payment_tab_status TEXT;
