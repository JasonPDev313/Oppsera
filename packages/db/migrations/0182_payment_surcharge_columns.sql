-- Migration: 0182_payment_surcharge_columns
-- Description: Add surcharge_amount_cents to payment_intents, payment_transactions, and tenders

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS surcharge_amount_cents INTEGER DEFAULT 0;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS surcharge_amount_cents INTEGER DEFAULT 0;

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS surcharge_amount_cents INTEGER DEFAULT 0;
