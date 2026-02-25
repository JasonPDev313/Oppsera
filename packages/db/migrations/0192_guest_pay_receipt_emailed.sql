-- Guest Pay: track when receipt email was sent (rate limit: one per session)
ALTER TABLE guest_pay_sessions
  ADD COLUMN IF NOT EXISTS receipt_emailed_at TIMESTAMPTZ;
