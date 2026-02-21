-- ═══════════════════════════════════════════════════════════════════════════
-- Oppsera Universal Chart of Accounts — SQL Seed
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Usage:
--   Replace '{{TENANT_ID}}' with the actual tenant ULID before running.
--   Idempotent: ON CONFLICT (tenant_id, account_number) DO NOTHING.
--   Parent accounts are inserted first to satisfy parent_account_id FK.
--
-- Schema note:
--   The existing gl_accounts table uses 5 account types:
--     asset, liability, equity, revenue, expense
--   COGS maps to 'expense', OTHER_INCOME maps to 'revenue',
--   OTHER_EXPENSE maps to 'expense'. The sub_type column distinguishes them.
--
-- This script adds account_role and sub_type columns if they don't exist yet.
-- These are the new columns required by the role-based mapping layer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Schema additions (safe to re-run) ────────────────────────────────────
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS account_role TEXT;
ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS sub_type TEXT;

-- Unique partial index: only one account per role per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_accounts_tenant_role
  ON gl_accounts (tenant_id, account_role)
  WHERE account_role IS NOT NULL;

-- Index for role lookups
CREATE INDEX IF NOT EXISTS idx_gl_accounts_tenant_role
  ON gl_accounts (tenant_id, account_role)
  WHERE account_role IS NOT NULL;

-- ── Helper: generate ULID-like IDs ──────────────────────────────────────
-- In production, use your application's ULID generator.
-- This uses gen_random_uuid() as a placeholder for the seed script.
-- Replace with actual ULIDs if needed.

-- ═══════════════════════════════════════════════════════════════════════════
-- ASSETS (10000–16999)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Cash & Bank Accounts ────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10000', 'Cash & Bank Accounts', 'asset', 'debit', true, true, 'bank', true, 'Control account for all cash and bank sub-accounts', NULL, 'Current Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10100', 'Cash - Operating Account', 'asset', 'debit', true, false, NULL, true, 'Primary operating bank account for daily business transactions', 'CASH_OPERATING', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '10000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10200', 'Petty Cash', 'asset', 'debit', true, false, NULL, true, 'Small on-hand cash fund for minor incidental expenses', 'CASH_PETTY', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '10000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10300', 'Cash - Safe', 'asset', 'debit', true, false, NULL, true, 'Cash held in physical safe pending deposit', 'CASH_SAFE', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '10000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10400', 'Undeposited Funds', 'asset', 'debit', true, false, 'undeposited_funds', true, 'Payments received but not yet deposited to the bank', 'UNDEPOSITED_FUNDS', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '10000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10500', 'Merchant Clearing Account', 'asset', 'debit', true, false, NULL, true, 'Clearing account for credit/debit card transactions pending settlement', 'MERCHANT_CLEARING', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '10000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '10600', 'Gift Card Clearing Account', 'asset', 'debit', true, false, NULL, true, 'Clearing account for gift card redemptions pending processing', 'GIFT_CARD_CLEARING', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '10000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Accounts Receivable ─────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '11000', 'Accounts Receivable', 'asset', 'debit', true, true, 'ar', false, 'Control account for all trade receivables owed by customers', 'AR_CONTROL', 'Current Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '11100', 'AR - House Accounts', 'asset', 'debit', true, false, NULL, true, 'Receivables from individual house account customers (POS charge-to-account)', 'AR_HOUSE', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '11000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '11200', 'AR - Corporate Accounts', 'asset', 'debit', true, false, NULL, true, 'Receivables from corporate billing accounts and group invoices', 'AR_CORPORATE', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '11000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Inventory ───────────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '12000', 'Inventory', 'asset', 'debit', true, true, NULL, false, 'Control account for all inventory asset sub-accounts', 'INVENTORY_CONTROL', 'Current Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '12100', 'Inventory - Retail Merchandise', 'asset', 'debit', true, false, NULL, true, 'Cost of retail goods held for resale (pro shop, gift shop, general merchandise)', 'INVENTORY_RETAIL', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '12000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '12200', 'Inventory - Food', 'asset', 'debit', true, false, NULL, true, 'Cost of food ingredients and prepared items held for sale', 'INVENTORY_FOOD', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '12000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '12300', 'Inventory - Beverage', 'asset', 'debit', true, false, NULL, true, 'Cost of alcoholic and non-alcoholic beverages held for sale', 'INVENTORY_BEVERAGE', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '12000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '12400', 'Inventory - Supplies', 'asset', 'debit', true, false, NULL, true, 'Consumable operating supplies (cleaning, packaging, disposables)', 'INVENTORY_SUPPLIES', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '12000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '12500', 'Inventory - Rental & Equipment', 'asset', 'debit', true, false, NULL, true, 'Rental inventory items (golf carts, boats, equipment for hire)', 'INVENTORY_RENTAL', 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '12000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Prepaid Expenses ────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '13000', 'Prepaid Expenses', 'asset', 'debit', true, true, NULL, true, 'Control account for expenses paid in advance of the benefit period', NULL, 'Current Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '13100', 'Prepaid Insurance', 'asset', 'debit', true, false, NULL, true, 'Insurance premiums paid in advance, amortized monthly', NULL, 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '13000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '13200', 'Prepaid Rent', 'asset', 'debit', true, false, NULL, true, 'Rent or lease payments made in advance of the occupancy period', NULL, 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '13000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '13300', 'Prepaid Licenses & Permits', 'asset', 'debit', true, false, NULL, true, 'License and permit fees paid in advance (liquor, health, business)', NULL, 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '13000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Other Current Assets ────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '14000', 'Other Current Assets', 'asset', 'debit', true, true, NULL, true, 'Control account for miscellaneous short-term assets', NULL, 'Current Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '14100', 'Utility Deposits', 'asset', 'debit', true, false, NULL, true, 'Refundable deposits held by utility providers', NULL, 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '14000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '14200', 'Vendor Deposits', 'asset', 'debit', true, false, NULL, true, 'Advance deposits paid to vendors or suppliers', NULL, 'Current Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '14000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Fixed Assets ────────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15000', 'Fixed Assets', 'asset', 'debit', true, true, NULL, true, 'Control account for all long-lived tangible property and equipment', NULL, 'Fixed Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15100', 'Land', 'asset', 'debit', true, false, NULL, true, 'Cost of land owned (not depreciated)', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15150', 'Land Improvements', 'asset', 'debit', true, false, NULL, true, 'Improvements to land (parking lots, landscaping, irrigation, fencing)', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15200', 'Buildings', 'asset', 'debit', true, false, NULL, true, 'Cost of owned buildings and permanent structures', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15300', 'Leasehold Improvements', 'asset', 'debit', true, false, NULL, true, 'Improvements made to leased property (build-outs, fixtures, signage)', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15400', 'Furniture & Fixtures', 'asset', 'debit', true, false, NULL, true, 'Tables, chairs, shelving, display cases, and permanent fixtures', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15500', 'Equipment - General', 'asset', 'debit', true, false, NULL, true, 'General business equipment (tools, machines, appliances)', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15600', 'POS Hardware & Equipment', 'asset', 'debit', true, false, NULL, true, 'Point-of-sale terminals, card readers, receipt printers, scanners', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15700', 'Kitchen Equipment', 'asset', 'debit', true, false, NULL, true, 'Commercial kitchen equipment (ovens, refrigerators, prep stations)', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15800', 'Golf Course Equipment', 'asset', 'debit', true, false, NULL, true, 'Mowers, carts, irrigation systems, and course maintenance equipment', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15850', 'Vehicles', 'asset', 'debit', true, false, NULL, true, 'Company-owned vehicles (delivery, shuttle, utility)', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15900', 'Marina Equipment', 'asset', 'debit', true, false, NULL, true, 'Docks, lifts, fuel systems, and marine maintenance equipment', NULL, 'Fixed Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '15999', 'Accumulated Depreciation', 'asset', 'credit', true, false, NULL, true, 'Total accumulated depreciation on all fixed assets (contra-asset)', NULL, 'Contra Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '15000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Intangible Assets ───────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '16000', 'Intangible Assets', 'asset', 'debit', true, true, NULL, true, 'Control account for non-physical long-lived assets', NULL, 'Intangible Asset')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '16100', 'Software', 'asset', 'debit', true, false, NULL, true, 'Capitalized software purchases and licenses', NULL, 'Intangible Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '16000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '16200', 'Development Costs', 'asset', 'debit', true, false, NULL, true, 'Capitalized internal or external development costs', NULL, 'Intangible Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '16000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '16300', 'Goodwill', 'asset', 'debit', true, false, NULL, true, 'Excess purchase price over fair value of net assets in an acquisition', NULL, 'Intangible Asset', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '16000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- LIABILITIES (20000–25999)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Accounts Payable ────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '20000', 'Accounts Payable', 'liability', 'credit', true, true, 'ap', false, 'Control account for all trade payables owed to vendors and suppliers', 'AP_CONTROL', 'Current Liability')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '20100', 'Credit Cards Payable', 'liability', 'credit', true, false, NULL, true, 'Balances owed on company credit cards', 'CREDIT_CARDS_PAYABLE', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '20000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '20200', 'Merchant Fees Payable', 'liability', 'credit', true, false, NULL, true, 'Accrued payment processor fees not yet deducted from settlements', 'MERCHANT_FEES_PAYABLE', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '20000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Accrued & Tax Liabilities ───────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '21000', 'Accrued Expenses', 'liability', 'credit', true, true, NULL, true, 'Control account for expenses incurred but not yet paid', NULL, 'Current Liability')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '21100', 'Payroll Liabilities', 'liability', 'credit', true, false, NULL, true, 'Net wages, withholdings, and deductions owed to employees', 'PAYROLL_LIABILITIES', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '21000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '21200', 'Payroll Taxes Payable', 'liability', 'credit', true, false, NULL, true, 'Employer and employee payroll taxes owed to government agencies', 'PAYROLL_TAXES_PAYABLE', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '21000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '21300', 'Sales Tax Payable', 'liability', 'credit', true, false, 'sales_tax', true, 'Collected sales tax owed to state/local tax authorities', 'SALES_TAX_PAYABLE', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '21000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '21400', 'Tips Payable', 'liability', 'credit', true, false, NULL, true, 'Gratuities collected on behalf of employees, pending payout', 'TIPS_PAYABLE', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '21000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '21500', 'PTO / Vacation Accrual', 'liability', 'credit', true, false, NULL, true, 'Accrued paid time off liability owed to employees', NULL, 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '21000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Deferred Revenue ────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '22000', 'Deferred Revenue', 'liability', 'credit', true, true, NULL, true, 'Control account for payments received before services/goods are delivered', NULL, 'Current Liability')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '22100', 'Gift Card Liability', 'liability', 'credit', true, false, NULL, true, 'Outstanding gift card balances — revenue recognized upon redemption', 'GIFT_CARD_LIABILITY', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '22000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '22200', 'Customer Deposits', 'liability', 'credit', true, false, NULL, true, 'Advance deposits from customers for future goods or services', 'CUSTOMER_DEPOSITS', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '22000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '22300', 'Membership Deposits', 'liability', 'credit', true, false, NULL, true, 'Deposits received for membership initiation, refundable or applied to dues', 'MEMBERSHIP_DEPOSITS', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '22000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '22400', 'Event Deposits', 'liability', 'credit', true, false, NULL, true, 'Advance deposits for booked events, banquets, and catering contracts', 'EVENT_DEPOSITS', 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '22000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Short-Term Debt ─────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '23000', 'Short-Term Debt', 'liability', 'credit', true, true, NULL, true, 'Control account for borrowings due within one year', NULL, 'Current Liability')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '23100', 'Short-Term Notes Payable', 'liability', 'credit', true, false, NULL, true, 'Promissory notes and short-term loans due within 12 months', NULL, 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '23000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '23200', 'Line of Credit', 'liability', 'credit', true, false, NULL, true, 'Outstanding balance on revolving credit facility', NULL, 'Current Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '23000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Long-Term Liabilities ───────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '24000', 'Long-Term Liabilities', 'liability', 'credit', true, true, NULL, true, 'Control account for obligations due beyond one year', NULL, 'Long-Term Liability')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '24100', 'Notes Payable - Long-Term', 'liability', 'credit', true, false, NULL, true, 'Long-term promissory notes and term loans', NULL, 'Long-Term Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '24000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '24200', 'Equipment Loans', 'liability', 'credit', true, false, NULL, true, 'Financed equipment purchases with terms beyond one year', NULL, 'Long-Term Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '24000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '24300', 'Mortgage Payable', 'liability', 'credit', true, false, NULL, true, 'Outstanding mortgage on owned real property', NULL, 'Long-Term Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '24000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '24400', 'Lease Liabilities', 'liability', 'credit', true, false, NULL, true, 'Present value of future lease payments under ASC 842 / IFRS 16', NULL, 'Long-Term Liability', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '24000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- EQUITY (30000–33999)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '30000', 'Owner''s Equity', 'equity', 'credit', true, true, NULL, true, 'Control account for owner and partner capital contributions', NULL, 'Owner Equity')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '30100', 'Owner Capital Contributions', 'equity', 'credit', true, false, NULL, true, 'Capital invested by the primary owner into the business', 'OWNER_CAPITAL', 'Owner Equity', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '30000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '30200', 'Partner Capital', 'equity', 'credit', true, false, NULL, true, 'Capital invested by additional partners or co-owners', NULL, 'Owner Equity', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '30000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '31000', 'Retained Earnings', 'equity', 'credit', true, false, NULL, true, 'Cumulative net income retained in the business from prior fiscal years', 'RETAINED_EARNINGS', 'Retained Earnings'),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '31100', 'Current Year Earnings', 'equity', 'credit', true, false, NULL, true, 'Net income for the current fiscal year (auto-closed to Retained Earnings at year-end)', 'CURRENT_YEAR_EARNINGS', 'Retained Earnings'),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '32000', 'Owner Draw / Distributions', 'equity', 'debit', true, false, NULL, true, 'Withdrawals and distributions taken by owner(s) — reduces equity', 'OWNER_DRAW', 'Owner Draw')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVENUE (40000–43999)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40000', 'Operating Revenue', 'revenue', 'credit', true, true, NULL, true, 'Control account for all primary sales and service revenue', NULL, 'Operating Revenue')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40100', 'Retail Sales', 'revenue', 'credit', true, false, NULL, true, 'Revenue from general retail and pro shop product sales', 'SALES_RETAIL', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40200', 'Food Sales', 'revenue', 'credit', true, false, NULL, true, 'Revenue from food items sold through restaurant, grill, or snack bar', 'SALES_FOOD', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40300', 'Beverage Sales - Alcohol', 'revenue', 'credit', true, false, NULL, true, 'Revenue from beer, wine, spirits, and cocktail sales', 'SALES_BEVERAGE_ALCOHOL', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40400', 'Beverage Sales - Non-Alcohol', 'revenue', 'credit', true, false, NULL, true, 'Revenue from soft drinks, coffee, tea, juice, and water', 'SALES_BEVERAGE_NON_ALCOHOL', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40500', 'Merchandise Sales', 'revenue', 'credit', true, false, NULL, true, 'Revenue from branded merchandise, apparel, and specialty goods', 'SALES_MERCHANDISE', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40600', 'Rental Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from equipment, cart, boat, or space rentals', 'SALES_RENTAL', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40700', 'Service Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from professional services (repairs, alterations, salon, spa)', 'SALES_SERVICE', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40800', 'Membership Revenue', 'revenue', 'credit', true, false, NULL, true, 'Recurring membership dues and initiation fees recognized over the period', 'SALES_MEMBERSHIP', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '40900', 'Green Fees / Activity Fees', 'revenue', 'credit', true, false, NULL, true, 'Revenue from golf green fees, court fees, and facility usage charges', 'SALES_GREEN_FEES', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41000', 'Lessons / Instruction Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from private/group lessons, clinics, and instructional programs', 'SALES_LESSONS', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41100', 'Room Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from hotel, lodge, cottage, and short-term rental accommodations', 'SALES_ROOM', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41200', 'Resort Fees', 'revenue', 'credit', true, false, NULL, true, 'Mandatory resort or facility fees charged to lodging guests', NULL, 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41300', 'Late Checkout Fees', 'revenue', 'credit', true, false, NULL, true, 'Fees charged for extended checkout beyond standard time', NULL, 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41400', 'Event Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from hosted events, private parties, and venue rental', 'SALES_EVENT', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41500', 'Banquet Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from banquet packages including food, beverage, and service', NULL, 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41600', 'Catering Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from off-site and on-site catering services', 'SALES_CATERING', 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '41700', 'Wedding Revenue', 'revenue', 'credit', true, false, NULL, true, 'Revenue from wedding ceremonies, receptions, and wedding packages', NULL, 'Operating Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '40000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Other Operating Revenue ─────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '42000', 'Other Operating Revenue', 'revenue', 'credit', true, true, NULL, true, 'Control account for secondary and ancillary operating revenue streams', NULL, 'Other Revenue')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '42100', 'Shipping Income', 'revenue', 'credit', true, false, NULL, true, 'Revenue from shipping and delivery charges passed to customers', NULL, 'Other Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '42000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '42200', 'Service Charges', 'revenue', 'credit', true, false, NULL, true, 'Mandatory service charges and auto-gratuities added to orders', NULL, 'Other Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '42000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '42300', 'Convenience Fees', 'revenue', 'credit', true, false, NULL, true, 'Fees charged for online ordering, delivery, or premium payment methods', NULL, 'Other Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '42000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '42400', 'Booking Fees', 'revenue', 'credit', true, false, NULL, true, 'Non-refundable fees for tee-time, reservation, or event bookings', NULL, 'Other Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '42000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRA REVENUE (49000–49999)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '49000', 'Contra Revenue', 'revenue', 'debit', true, true, NULL, true, 'Control account for all revenue reductions (discounts, returns, comps)', NULL, 'Contra Revenue')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '49100', 'Discounts Given', 'revenue', 'debit', true, false, NULL, true, 'POS and manual discounts applied to orders (percentage or fixed)', 'DISCOUNTS_GIVEN', 'Contra Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '49000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '49200', 'Promotions', 'revenue', 'debit', true, false, NULL, true, 'Promotional offers, BOGO, and marketing-driven price reductions', NULL, 'Contra Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '49000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '49300', 'Refunds & Returns', 'revenue', 'debit', true, false, NULL, true, 'Customer refunds and returned merchandise reversing original revenue', 'REFUNDS_RETURNS', 'Contra Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '49000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '49400', 'Comps', 'revenue', 'debit', true, false, NULL, true, 'Complimentary items and services given at no charge (manager comps, VIP)', 'COMPS', 'Contra Revenue', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '49000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- COST OF GOODS SOLD (50000–51999) — stored as account_type='expense'
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50000', 'Cost of Goods Sold', 'expense', 'debit', true, true, NULL, true, 'Control account for all direct costs of products sold', NULL, 'Cost of Goods Sold')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50100', 'COGS - Retail', 'expense', 'debit', true, false, NULL, true, 'Cost of retail merchandise sold (pro shop, general merchandise)', 'COGS_RETAIL', 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50200', 'COGS - Food', 'expense', 'debit', true, false, NULL, true, 'Cost of food ingredients consumed in the production of food sales', 'COGS_FOOD', 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50300', 'COGS - Beverage Alcohol', 'expense', 'debit', true, false, NULL, true, 'Cost of alcoholic beverages consumed in production of alcohol sales', 'COGS_BEVERAGE_ALCOHOL', 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50400', 'COGS - Beverage Non-Alcohol', 'expense', 'debit', true, false, NULL, true, 'Cost of non-alcoholic beverages (soft drinks, coffee, juices)', 'COGS_BEVERAGE_NON_ALCOHOL', 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50500', 'COGS - Merchandise', 'expense', 'debit', true, false, NULL, true, 'Cost of branded merchandise and apparel sold', 'COGS_MERCHANDISE', 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50600', 'COGS - Supplies', 'expense', 'debit', true, false, NULL, true, 'Cost of consumable supplies used directly in service delivery', 'COGS_SUPPLIES', 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50700', 'Inventory Adjustments', 'expense', 'debit', true, false, NULL, true, 'Inventory count adjustments, corrections, and write-downs', NULL, 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50800', 'Spoilage', 'expense', 'debit', true, false, NULL, true, 'Cost of perishable inventory that expired or was damaged beyond sale', NULL, 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '50900', 'Shrinkage', 'expense', 'debit', true, false, NULL, true, 'Inventory losses due to theft, breakage, or unaccounted variance', NULL, 'Cost of Goods Sold', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '50000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- OPERATING EXPENSES (60000–69999)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Payroll Expenses ────────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60000', 'Payroll Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for all compensation and benefit costs', NULL, 'Payroll Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60100', 'Wages - Hourly', 'expense', 'debit', true, false, NULL, true, 'Hourly employee wages (servers, cashiers, line cooks, staff)', 'WAGES', 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60200', 'Salaries', 'expense', 'debit', true, false, NULL, true, 'Salaried employee compensation (managers, administrators)', 'SALARIES', 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60300', 'Overtime', 'expense', 'debit', true, false, NULL, true, 'Overtime premium pay in excess of regular wage rates', NULL, 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60400', 'Bonuses & Commissions', 'expense', 'debit', true, false, NULL, true, 'Performance bonuses, sales commissions, and incentive payouts', NULL, 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60500', 'Employer Payroll Taxes', 'expense', 'debit', true, false, NULL, true, 'Employer share of FICA, FUTA, SUTA, and other payroll taxes', NULL, 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60600', 'Employee Benefits', 'expense', 'debit', true, false, NULL, true, 'Health insurance, dental, vision, life insurance, and other benefits', NULL, 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '60700', '401k / Retirement Contributions', 'expense', 'debit', true, false, NULL, true, 'Employer matching contributions to 401k, IRA, or pension plans', NULL, 'Payroll Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '60000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Facilities Expenses ─────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61000', 'Facilities Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for occupancy, property, and facilities maintenance costs', NULL, 'Facilities Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61100', 'Rent / Lease Payments', 'expense', 'debit', true, false, NULL, true, 'Monthly rent or lease payments for business premises', 'RENT_LEASE', 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61200', 'Property Taxes', 'expense', 'debit', true, false, NULL, true, 'Real estate and property tax assessments on owned property', NULL, 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61300', 'Property Insurance', 'expense', 'debit', true, false, NULL, true, 'Property, casualty, and general liability insurance premiums', NULL, 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61400', 'Utilities', 'expense', 'debit', true, false, NULL, true, 'Electric, gas, water, sewer, and waste disposal services', NULL, 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61500', 'Repairs & Maintenance', 'expense', 'debit', true, false, NULL, true, 'Building repairs, HVAC maintenance, plumbing, and general upkeep', NULL, 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61600', 'Cleaning & Janitorial', 'expense', 'debit', true, false, NULL, true, 'Cleaning services, janitorial supplies, and sanitation', NULL, 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '61700', 'Security Services', 'expense', 'debit', true, false, NULL, true, 'Security guards, alarm monitoring, camera systems, and access control', NULL, 'Facilities Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '61000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Technology Expenses ─────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '62000', 'Technology Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for all IT, software, and technology costs', NULL, 'Technology Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '62100', 'Software Subscriptions', 'expense', 'debit', true, false, NULL, true, 'SaaS subscriptions, cloud services, and recurring software fees', NULL, 'Technology Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '62000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '62200', 'POS System Fees', 'expense', 'debit', true, false, NULL, true, 'Monthly POS platform fees, terminal licenses, and support', NULL, 'Technology Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '62000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '62300', 'Payment Processing Fees', 'expense', 'debit', true, false, NULL, true, 'Credit/debit card transaction fees, gateway fees, and processor charges', 'PAYMENT_PROCESSING_FEES', 'Technology Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '62000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '62400', 'IT Support & Services', 'expense', 'debit', true, false, NULL, true, 'Outsourced IT support, help desk, network management, and consulting', NULL, 'Technology Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '62000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '62500', 'Internet & Telecom', 'expense', 'debit', true, false, NULL, true, 'Internet service, phone lines, mobile plans, and telecom', NULL, 'Technology Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '62000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Marketing Expenses ──────────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '63000', 'Marketing Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for all advertising, promotion, and brand costs', NULL, 'Marketing Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '63100', 'Advertising', 'expense', 'debit', true, false, NULL, true, 'Print, digital, radio, TV, and social media advertising spend', NULL, 'Marketing Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '63000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '63200', 'Promotions & Campaigns', 'expense', 'debit', true, false, NULL, true, 'Cost of promotional campaigns, events, and seasonal marketing', NULL, 'Marketing Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '63000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '63300', 'Website & SEO', 'expense', 'debit', true, false, NULL, true, 'Website hosting, development, maintenance, and SEO services', NULL, 'Marketing Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '63000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '63400', 'Loyalty Program Costs', 'expense', 'debit', true, false, NULL, true, 'Cost of loyalty rewards, points redemptions, and loyalty platform fees', NULL, 'Marketing Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '63000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Administrative Expenses ─────────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '64000', 'Administrative Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for general and administrative overhead costs', NULL, 'Administrative Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '64100', 'Office Supplies', 'expense', 'debit', true, false, NULL, true, 'Paper, toner, pens, receipt rolls, and general office supplies', NULL, 'Administrative Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '64000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '64200', 'Legal Fees', 'expense', 'debit', true, false, NULL, true, 'Attorney fees, legal consultations, contracts, and compliance', NULL, 'Administrative Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '64000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '64300', 'Accounting & Bookkeeping Fees', 'expense', 'debit', true, false, NULL, true, 'CPA, bookkeeping, tax preparation, and audit services', NULL, 'Administrative Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '64000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '64400', 'Bank Service Charges', 'expense', 'debit', true, false, NULL, true, 'Monthly bank fees, wire transfer fees, and account maintenance charges', NULL, 'Administrative Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '64000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '64500', 'Licenses & Permits', 'expense', 'debit', true, false, NULL, true, 'Business licenses, health permits, liquor licenses, and regulatory fees', NULL, 'Administrative Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '64000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ── Industry-Specific Expenses ──────────────────────────────────────────
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65000', 'Industry-Specific Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for industry-specific operational costs (golf, marina, hospitality)', NULL, 'Industry Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65100', 'Course Maintenance', 'expense', 'debit', true, false, NULL, true, 'Golf course turf care, mowing, aeration, and course upkeep', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65200', 'Grounds Crew', 'expense', 'debit', true, false, NULL, true, 'Grounds maintenance labor (separate from general payroll for tracking)', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65300', 'Chemicals & Fertilizer', 'expense', 'debit', true, false, NULL, true, 'Pesticides, herbicides, fertilizer, and turf treatment chemicals', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65400', 'Marina Operations', 'expense', 'debit', true, false, NULL, true, 'General marina operating costs including fuel, pumping, and supplies', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65500', 'Dock Maintenance', 'expense', 'debit', true, false, NULL, true, 'Dock repairs, piling maintenance, and slip infrastructure upkeep', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65600', 'Housekeeping', 'expense', 'debit', true, false, NULL, true, 'Room cleaning, turnover, linens, amenities, and housekeeping supplies', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65700', 'Laundry Services', 'expense', 'debit', true, false, NULL, true, 'Commercial laundry, dry cleaning, linen rental, and uniform cleaning', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65800', 'Vehicle & Equipment Fuel', 'expense', 'debit', true, false, NULL, true, 'Fuel for company vehicles, golf carts, mowers, and boats', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '65900', 'Equipment Repairs', 'expense', 'debit', true, false, NULL, true, 'Repair and servicing of specialized equipment (kitchen, marine, course)', NULL, 'Industry Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '65000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- OTHER INCOME / EXPENSE (80000–82999)
-- ═══════════════════════════════════════════════════════════════════════════

-- Other Income — stored as account_type='revenue' with sub_type='Other Income'
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '80000', 'Other Income', 'revenue', 'credit', true, true, NULL, true, 'Control account for non-operating income (interest, gains)', NULL, 'Other Income')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '80100', 'Interest Income', 'revenue', 'credit', true, false, NULL, true, 'Interest earned on bank accounts, money market, or investments', 'INTEREST_INCOME', 'Other Income', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '80000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '80200', 'Gain on Sale of Assets', 'revenue', 'credit', true, false, NULL, true, 'Gain realized from disposal of fixed assets above book value', NULL, 'Other Income', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '80000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- Other Expense — stored as account_type='expense' with sub_type='Other Expense'
INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '81000', 'Other Expenses', 'expense', 'debit', true, true, NULL, true, 'Control account for non-operating expenses (interest, depreciation, amortization)', NULL, 'Other Expense')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '81100', 'Interest Expense', 'expense', 'debit', true, false, NULL, true, 'Interest paid on loans, lines of credit, and financed equipment', 'INTEREST_EXPENSE', 'Other Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '81000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '81200', 'Depreciation Expense', 'expense', 'debit', true, false, NULL, true, 'Periodic depreciation of tangible fixed assets', 'DEPRECIATION_EXPENSE', 'Other Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '81000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '81300', 'Amortization Expense', 'expense', 'debit', true, false, NULL, true, 'Periodic amortization of intangible assets and leasehold improvements', NULL, 'Other Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '81000')),
  (gen_random_uuid()::text, '{{TENANT_ID}}', '81400', 'Other Miscellaneous Expense', 'expense', 'debit', true, false, NULL, true, 'Non-recurring and miscellaneous non-operating expenses', NULL, 'Other Expense', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '81000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SYSTEM / STATISTICAL (90000–99999)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '99000', 'System Accounts', 'expense', 'debit', true, true, NULL, false, 'Control account for system-managed accounts (rounding, suspense)', NULL, 'System')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type, parent_account_id)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '99910', 'Rounding / Reconciliation Adjustments', 'expense', 'debit', true, false, NULL, false, 'Auto-posted penny rounding to balance journal entries within tolerance', 'ROUNDING_RECONCILIATION', 'System', (SELECT id FROM gl_accounts WHERE tenant_id = '{{TENANT_ID}}' AND account_number = '99000'))
ON CONFLICT (tenant_id, account_number) DO NOTHING;

INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, is_active, is_control_account, control_account_type, allow_manual_posting, description, account_role, sub_type)
VALUES
  (gen_random_uuid()::text, '{{TENANT_ID}}', '99920', 'Suspense / Clearing Account', 'asset', 'debit', true, false, NULL, false, 'Temporary holding account for unclassified transactions pending resolution', 'SUSPENSE_CLEARING', 'System')
ON CONFLICT (tenant_id, account_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done. 160 accounts seeded for tenant '{{TENANT_ID}}'.
-- All accounts are soft-coded — tenant can rename, re-number, deactivate,
-- or add new accounts at any time via the Accounting settings UI.
-- ═══════════════════════════════════════════════════════════════════════════
