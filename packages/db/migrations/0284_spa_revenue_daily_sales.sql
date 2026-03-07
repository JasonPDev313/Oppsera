-- Migration 0284: Spa revenue daily sales + PMS GL entry type constraint fix
--
-- 1. Add spa_revenue column to rm_daily_sales
-- 2. Fix CHECK constraint on pms_folio_entry_type_gl_defaults to include DEPOSIT + LOYALTY_REDEMPTION

-- ── 1. Add spa_revenue to rm_daily_sales ─────────────────────────
ALTER TABLE rm_daily_sales
  ADD COLUMN IF NOT EXISTS spa_revenue NUMERIC(19,4) NOT NULL DEFAULT '0';

-- ── 2. Fix CHECK constraint on pms_folio_entry_type_gl_defaults ──
-- Original constraint only allowed: ROOM_CHARGE, TAX, FEE, ADJUSTMENT, PAYMENT, REFUND
-- Deposit and loyalty adapters need DEPOSIT and LOYALTY_REDEMPTION entry types.
ALTER TABLE pms_folio_entry_type_gl_defaults
  DROP CONSTRAINT IF EXISTS pms_folio_entry_type_gl_defaults_entry_type_check;

ALTER TABLE pms_folio_entry_type_gl_defaults
  ADD CONSTRAINT pms_folio_entry_type_gl_defaults_entry_type_check
  CHECK (entry_type IN (
    'ROOM_CHARGE', 'TAX', 'FEE', 'ADJUSTMENT', 'PAYMENT', 'REFUND',
    'DEPOSIT', 'LOYALTY_REDEMPTION'
  ));
