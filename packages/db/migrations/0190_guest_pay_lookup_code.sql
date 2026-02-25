-- Migration 0190: Guest Pay — Lookup code for manual entry
-- Adds a 6-char alphanumeric lookup code so customers can type their check code
-- instead of scanning a QR code.

-- Add column (nullable so existing rows are unaffected)
ALTER TABLE guest_pay_sessions
  ADD COLUMN IF NOT EXISTS lookup_code TEXT;

-- Partial unique index: codes must be unique among active sessions only.
-- Expired/paid/invalidated/superseded sessions can reuse codes.
-- Case-insensitive via UPPER().
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_pay_sessions_lookup_code_active
  ON guest_pay_sessions (UPPER(lookup_code))
  WHERE status = 'active' AND lookup_code IS NOT NULL;
