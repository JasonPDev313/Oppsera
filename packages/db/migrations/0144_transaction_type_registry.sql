-- Transaction Type Registry + Tenant Tender Types
-- Provides a canonical list of all financial event types and custom payment methods.

-- ── gl_transaction_types ─────────────────────────────────────────
-- System types: tenant_id IS NULL (global, cannot delete)
-- Tenant types: tenant_id IS NOT NULL (custom, per-tenant)
CREATE TABLE IF NOT EXISTS gl_transaction_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_debit_account_type TEXT,
  default_credit_account_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System types unique on code (no tenant)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_txn_types_system_code
  ON gl_transaction_types (code) WHERE tenant_id IS NULL;

-- Tenant types unique on (tenant_id, code)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_txn_types_tenant_code
  ON gl_transaction_types (tenant_id, code) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_txn_types_tenant
  ON gl_transaction_types (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_txn_types_category
  ON gl_transaction_types (category, sort_order);

-- ── tenant_tender_types ──────────────────────────────────────────
-- Custom/external payment methods defined by each tenant.
CREATE TABLE IF NOT EXISTS tenant_tender_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  posting_mode TEXT NOT NULL DEFAULT 'clearing',
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_reference BOOLEAN NOT NULL DEFAULT false,
  reference_label TEXT,
  default_clearing_account_id TEXT REFERENCES gl_accounts(id),
  default_bank_account_id TEXT REFERENCES gl_accounts(id),
  default_fee_account_id TEXT REFERENCES gl_accounts(id),
  default_expense_account_id TEXT REFERENCES gl_accounts(id),
  reporting_bucket TEXT NOT NULL DEFAULT 'include',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_tender_types_code
  ON tenant_tender_types (tenant_id, code);

CREATE INDEX IF NOT EXISTS idx_tenant_tender_types_active
  ON tenant_tender_types (tenant_id, is_active);

-- ── Extend payment_type_gl_defaults ──────────────────────────────
ALTER TABLE payment_type_gl_defaults
  ADD COLUMN IF NOT EXISTS posting_mode TEXT NOT NULL DEFAULT 'clearing';

ALTER TABLE payment_type_gl_defaults
  ADD COLUMN IF NOT EXISTS expense_account_id TEXT REFERENCES gl_accounts(id);

ALTER TABLE payment_type_gl_defaults
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ── RLS: gl_transaction_types ────────────────────────────────────
ALTER TABLE gl_transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_transaction_types FORCE ROW LEVEL SECURITY;

-- System types (tenant_id IS NULL) are readable by everyone
CREATE POLICY IF NOT EXISTS gl_txn_types_select_system ON gl_transaction_types
  FOR SELECT USING (tenant_id IS NULL);

-- Tenant types: only own tenant
CREATE POLICY IF NOT EXISTS gl_txn_types_select_tenant ON gl_transaction_types
  FOR SELECT USING (
    tenant_id IS NOT NULL
    AND tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY IF NOT EXISTS gl_txn_types_insert ON gl_transaction_types
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY IF NOT EXISTS gl_txn_types_update ON gl_transaction_types
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

-- ── RLS: tenant_tender_types ─────────────────────────────────────
ALTER TABLE tenant_tender_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_tender_types FORCE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS tenant_tender_types_select ON tenant_tender_types
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY IF NOT EXISTS tenant_tender_types_insert ON tenant_tender_types
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY IF NOT EXISTS tenant_tender_types_update ON tenant_tender_types
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

-- ── Seed system transaction types ────────────────────────────────
-- Uses gen_random_uuid() for IDs since ULIDs are app-generated.
-- ON CONFLICT skips existing system types for idempotency.
INSERT INTO gl_transaction_types (id, tenant_id, code, name, category, description, is_system, is_active, default_debit_account_type, default_credit_account_type, sort_order)
VALUES
  -- Tender types
  (gen_random_uuid()::text, NULL, 'cash', 'Cash Payments', 'tender', 'Physical cash tendered at POS', true, true, 'asset', NULL, 10),
  (gen_random_uuid()::text, NULL, 'card', 'Credit/Debit Card', 'tender', 'Integrated card payments (VPOS)', true, true, 'asset', NULL, 20),
  (gen_random_uuid()::text, NULL, 'ecom', 'E-Commerce', 'tender', 'Online/e-commerce card payments', true, true, 'asset', NULL, 25),
  (gen_random_uuid()::text, NULL, 'check', 'Check Payments', 'tender', 'Paper check payments', true, true, 'asset', NULL, 30),
  (gen_random_uuid()::text, NULL, 'ach', 'ACH/EFT', 'tender', 'Electronic funds transfer payments', true, true, 'asset', NULL, 40),
  (gen_random_uuid()::text, NULL, 'voucher', 'Gift Card / Voucher', 'tender', 'Gift card, voucher, or stored value redemption', true, true, 'liability', NULL, 50),
  (gen_random_uuid()::text, NULL, 'house_account', 'House Account / AR', 'tender', 'Charge to member or house account', true, true, 'asset', NULL, 60),
  (gen_random_uuid()::text, NULL, 'membership_payment', 'Payment by Membership ID', 'tender', 'Payment charged against membership billing', true, true, 'asset', NULL, 70),
  -- Revenue
  (gen_random_uuid()::text, NULL, 'gift_card_sold', 'Gift Card / Voucher Sold', 'revenue', 'Sale of a new gift card or voucher', true, true, 'asset', 'liability', 110),
  (gen_random_uuid()::text, NULL, 'gift_card_redeemed', 'Gift Card / Voucher Redeemed', 'revenue', 'Redemption of a gift card for goods/services', true, true, 'liability', 'revenue', 120),
  (gen_random_uuid()::text, NULL, 'gift_card_expired', 'Gift Card Breakage', 'revenue', 'Expired/unclaimed gift card breakage income', true, true, 'liability', 'revenue', 130),
  (gen_random_uuid()::text, NULL, 'tee_booking', 'Tee Bookings', 'revenue', 'Revenue from tee time bookings', true, true, 'asset', 'revenue', 140),
  (gen_random_uuid()::text, NULL, 'convenience_fee', 'Convenience Fee', 'revenue', 'Surcharge or convenience fee collected', true, true, 'asset', 'revenue', 150),
  -- Tax
  (gen_random_uuid()::text, NULL, 'sales_tax', 'Sales Tax Collected', 'tax', 'Sales tax collected on transactions', true, true, NULL, 'liability', 200),
  -- Tips
  (gen_random_uuid()::text, NULL, 'tip_collected', 'Tips Collected', 'tip', 'Tips/gratuities collected from customers', true, true, NULL, 'liability', 300),
  (gen_random_uuid()::text, NULL, 'tip_paidout', 'Tips Paid Out', 'tip', 'Tips paid out to employees', true, true, 'liability', 'asset', 310),
  (gen_random_uuid()::text, NULL, 'event_gratuity', 'Event Gratuity', 'tip', 'Auto-gratuity or service charge on events', true, true, NULL, 'liability', 320),
  -- Deposits
  (gen_random_uuid()::text, NULL, 'deposit_taken', 'Deposit Taken', 'deposit', 'Customer deposit for event, lodging, or tee time', true, true, 'asset', 'liability', 400),
  (gen_random_uuid()::text, NULL, 'deposit_applied', 'Deposit Applied', 'deposit', 'Previously-taken deposit applied to final payment', true, true, 'liability', 'revenue', 410),
  (gen_random_uuid()::text, NULL, 'event_deposit', 'Event Deposit', 'deposit', 'Deposit for event or banquet booking', true, true, 'asset', 'liability', 420),
  (gen_random_uuid()::text, NULL, 'event_final_payment', 'Event Final Payment', 'deposit', 'Final balance payment for event deposits', true, true, 'liability', 'revenue', 430),
  -- Refunds
  (gen_random_uuid()::text, NULL, 'refund', 'Refund / Return', 'refund', 'Customer refund or merchandise return', true, true, 'revenue', 'asset', 500),
  (gen_random_uuid()::text, NULL, 'refund_voucher', 'Refund to Voucher', 'refund', 'Refund issued as store credit or voucher', true, true, 'revenue', 'liability', 510),
  (gen_random_uuid()::text, NULL, 'void', 'Void / Cancel', 'refund', 'Voided or canceled transaction', true, true, NULL, NULL, 520),
  -- Settlement
  (gen_random_uuid()::text, NULL, 'processor_settlement', 'Processor Batch Settlement', 'settlement', 'Batch settlement from card processor', true, true, 'asset', 'asset', 600),
  (gen_random_uuid()::text, NULL, 'chargeback', 'Chargeback / Dispute', 'settlement', 'Card chargeback or payment dispute', true, true, 'expense', 'asset', 610),
  (gen_random_uuid()::text, NULL, 'processing_fee', 'Card Processing Fee', 'settlement', 'Merchant card processing fee', true, true, 'expense', 'asset', 620),
  -- Discount / Comp
  (gen_random_uuid()::text, NULL, 'discount', 'Discount Applied', 'other', 'Discount applied to transaction (contra-revenue)', true, true, 'revenue', NULL, 700),
  (gen_random_uuid()::text, NULL, 'comp', 'Comp / Giveaway', 'other', 'Complimentary items or services', true, true, 'expense', NULL, 710),
  -- Over/Short
  (gen_random_uuid()::text, NULL, 'over_short', 'Over/Short', 'other', 'Cash drawer over/short variance', true, true, 'expense', 'asset', 800),
  (gen_random_uuid()::text, NULL, 'cash_payout', 'Cash Payouts', 'other', 'Cash paid out from drawer (non-refund)', true, true, 'asset', 'asset', 810),
  -- AR
  (gen_random_uuid()::text, NULL, 'ar_invoice', 'AR Invoice Issued', 'ar', 'Accounts receivable invoice created', true, true, 'asset', 'revenue', 900),
  (gen_random_uuid()::text, NULL, 'ar_payment', 'AR Payment Received', 'ar', 'Payment received against AR invoice', true, true, 'asset', 'asset', 910),
  -- AP
  (gen_random_uuid()::text, NULL, 'ap_bill', 'AP Bill Entered', 'ap', 'Accounts payable bill recorded', true, true, 'expense', 'liability', 1000),
  (gen_random_uuid()::text, NULL, 'ap_payment', 'AP Payment', 'ap', 'Payment issued to vendor', true, true, 'liability', 'asset', 1010),
  -- Inventory
  (gen_random_uuid()::text, NULL, 'inventory_receiving', 'Inventory Receiving', 'inventory', 'Inventory received from vendor', true, true, 'asset', 'liability', 1050),
  (gen_random_uuid()::text, NULL, 'cogs_recognition', 'COGS Recognition', 'inventory', 'Cost of goods sold posting', true, true, 'expense', 'asset', 1060),
  -- Membership
  (gen_random_uuid()::text, NULL, 'membership_sale', 'Membership Sale / Dues', 'membership', 'New membership or renewal dues', true, true, 'asset', 'revenue', 1100),
  (gen_random_uuid()::text, NULL, 'membership_ar_payment', 'Membership AR Payment', 'membership', 'Payment received on member account', true, true, 'asset', 'asset', 1110),
  (gen_random_uuid()::text, NULL, 'membership_ap', 'Membership Amount AP', 'membership', 'Membership-related accounts payable', true, true, 'asset', 'liability', 1120),
  -- Events
  (gen_random_uuid()::text, NULL, 'event_registration', 'Event Registration', 'revenue', 'Revenue from event or tournament registration', true, true, 'asset', 'revenue', 1200)
ON CONFLICT DO NOTHING;
