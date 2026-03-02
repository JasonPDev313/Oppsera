-- Migration 0249: Add email tracking columns to spa_appointments
-- Supports confirmation and reminder email deduplication

ALTER TABLE spa_appointments
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMPTZ;

-- Index for reminder cron: find upcoming appointments that haven't received a reminder
CREATE INDEX IF NOT EXISTS idx_spa_appointments_reminder_pending
  ON spa_appointments (tenant_id, status, start_at)
  WHERE reminder_email_sent_at IS NULL;
