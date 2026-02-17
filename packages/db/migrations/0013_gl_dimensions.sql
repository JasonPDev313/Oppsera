-- Migration: 0013_gl_dimensions
-- Adds GL dimension columns to payment_journal_entries

ALTER TABLE payment_journal_entries
  ADD COLUMN gl_dimensions JSONB,
  ADD COLUMN recognition_status TEXT,
  ADD COLUMN recognition_date DATE,
  ADD COLUMN deferred_revenue_account_code TEXT;
