-- ═══════════════════════════════════════════════════════════════════════════════
-- Business Type Blueprints: Module Defaults, Accounting Config, Role Templates
-- ═══════════════════════════════════════════════════════════════════════════════
-- This migration seeds the complete provisioning blueprint for each system
-- business type: modules, accounting/ERP configuration, and RBAC role templates
-- with industry-standard permissions.
--
-- Design principles:
--   1. Modules per type reflect industry best practices for the vertical
--   2. Accounting defaults lean toward AUTOMATION for SMB (override tier defaults
--      only where the vertical needs visibility)
--   3. Roles are vertical-specific with least-privilege permissions
--   4. Super Admin gets ALL permissions; entitlements gate module access
--   5. All INSERTs use ON CONFLICT DO NOTHING for idempotency


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: MODULE DEFAULTS PER BUSINESS TYPE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Hotel (17 modules): full-service property — PMS, F&B, spa, full accounting suite
INSERT INTO business_type_module_defaults (id, business_type_version_id, module_key, is_enabled, access_mode, sort_order)
VALUES
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'platform_core', true, 'full', 1),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'catalog',       true, 'full', 2),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'orders',        true, 'full', 3),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'pos_retail',    true, 'full', 4),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'pos_fnb',       true, 'full', 5),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'payments',      true, 'full', 6),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'inventory',     true, 'full', 7),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'customers',     true, 'full', 8),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'reporting',     true, 'full', 9),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'accounting',    true, 'full', 10),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'ap',            true, 'full', 11),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'ar',            true, 'full', 12),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'pms',           true, 'full', 13),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'semantic',      true, 'full', 14),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'room_layouts',  true, 'full', 15),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'kds',           true, 'full', 16),
  (gen_ulid(), '01JQXBT000BTVER_HOTEL000', 'spa',           true, 'full', 17)
ON CONFLICT (business_type_version_id, module_key) DO NOTHING;

-- Restaurant (14 modules): F&B focused — KDS, floor plans, semantic analytics, AP for suppliers
INSERT INTO business_type_module_defaults (id, business_type_version_id, module_key, is_enabled, access_mode, sort_order)
VALUES
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'platform_core', true, 'full', 1),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'catalog',       true, 'full', 2),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'orders',        true, 'full', 3),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'pos_retail',    true, 'full', 4),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'pos_fnb',       true, 'full', 5),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'payments',      true, 'full', 6),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'inventory',     true, 'full', 7),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'customers',     true, 'full', 8),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'reporting',     true, 'full', 9),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'room_layouts',  true, 'full', 10),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'kds',           true, 'full', 11),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'accounting',    true, 'full', 12),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'ap',            true, 'full', 13),
  (gen_ulid(), '01JQXBT000BTVER_RESTAURA', 'semantic',      true, 'full', 14)
ON CONFLICT (business_type_version_id, module_key) DO NOTHING;

-- Retail (10 modules): POS focused — inventory, AP for vendor bills
INSERT INTO business_type_module_defaults (id, business_type_version_id, module_key, is_enabled, access_mode, sort_order)
VALUES
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'platform_core', true, 'full', 1),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'catalog',       true, 'full', 2),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'orders',        true, 'full', 3),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'pos_retail',    true, 'full', 4),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'payments',      true, 'full', 5),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'inventory',     true, 'full', 6),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'customers',     true, 'full', 7),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'reporting',     true, 'full', 8),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'accounting',    true, 'full', 9),
  (gen_ulid(), '01JQXBT000BTVER_RETAIL00', 'ap',            true, 'full', 10)
ON CONFLICT (business_type_version_id, module_key) DO NOTHING;

-- Golf / Country Club (16 modules): club ops — membership, F&B, pro shop, full accounting + AR
INSERT INTO business_type_module_defaults (id, business_type_version_id, module_key, is_enabled, access_mode, sort_order)
VALUES
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'platform_core',    true, 'full', 1),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'catalog',          true, 'full', 2),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'orders',           true, 'full', 3),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'pos_retail',       true, 'full', 4),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'pos_fnb',          true, 'full', 5),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'payments',         true, 'full', 6),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'inventory',        true, 'full', 7),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'customers',        true, 'full', 8),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'reporting',        true, 'full', 9),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'room_layouts',     true, 'full', 10),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'kds',              true, 'full', 11),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'accounting',       true, 'full', 12),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'ap',               true, 'full', 13),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'ar',               true, 'full', 14),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'club_membership',  true, 'full', 15),
  (gen_ulid(), '01JQXBT000BTVER_GOLF0000', 'semantic',         true, 'full', 16)
ON CONFLICT (business_type_version_id, module_key) DO NOTHING;

-- Spa (10 modules): service-oriented — appointments, retail product sales, AP for supplies
INSERT INTO business_type_module_defaults (id, business_type_version_id, module_key, is_enabled, access_mode, sort_order)
VALUES
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'platform_core', true, 'full', 1),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'catalog',       true, 'full', 2),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'orders',        true, 'full', 3),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'pos_retail',    true, 'full', 4),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'payments',      true, 'full', 5),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'customers',     true, 'full', 6),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'reporting',     true, 'full', 7),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'spa',           true, 'full', 8),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'accounting',    true, 'full', 9),
  (gen_ulid(), '01JQXBT000BTVER_SPA00000', 'ap',            true, 'full', 10)
ON CONFLICT (business_type_version_id, module_key) DO NOTHING;

-- Hybrid / Multi-Purpose Venue (15 modules): broadest non-hotel set — F&B, spa, AR for corporate billing
INSERT INTO business_type_module_defaults (id, business_type_version_id, module_key, is_enabled, access_mode, sort_order)
VALUES
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'platform_core', true, 'full', 1),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'catalog',       true, 'full', 2),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'orders',        true, 'full', 3),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'pos_retail',    true, 'full', 4),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'pos_fnb',       true, 'full', 5),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'payments',      true, 'full', 6),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'inventory',     true, 'full', 7),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'customers',     true, 'full', 8),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'reporting',     true, 'full', 9),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'room_layouts',  true, 'full', 10),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'kds',           true, 'full', 11),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'accounting',    true, 'full', 12),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'ap',            true, 'full', 13),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'ar',            true, 'full', 14),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'spa',           true, 'full', 15),
  (gen_ulid(), '01JQXBT000BTVER_HYBRID00', 'semantic',      true, 'full', 16)
ON CONFLICT (business_type_version_id, module_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: ACCOUNTING / ERP CONFIGURATION PER BUSINESS TYPE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Updates the empty templates created in 0282. SMB tier defaults (all auto,
-- invisible) apply as baseline; workflow_defaults here are OVERRIDES that make
-- critical vertical-specific workflows visible to operators.

-- Hotel: complex multi-department — perpetual COGS for F&B, deferred revenue for deposits,
-- bank reconciliation manual, AR workflows visible, tips/cash variance visible
UPDATE business_type_accounting_templates SET
  revenue_categories = '{"serviceRevenue":"SALES_ROOM","retailRevenue":"SALES_RETAIL","foodRevenue":"SALES_FOOD","beverageRevenue":"SALES_BEVERAGE_ALCOHOL"}',
  payment_gl_mappings = '{"cash":"CASH_OPERATING","creditCard":"MERCHANT_CLEARING","giftCard":"GIFT_CARD_CLEARING","memberCharge":"AR_HOUSE"}',
  tax_behavior = '{"defaultTaxInclusive":false,"separateTaxLiability":true}',
  deferred_revenue = '{"enabled":true,"liabilityAccount":"DEFERRED_REVENUE"}',
  cogs_behavior = 'perpetual',
  fiscal_settings = '{"fiscalYearStart":"01-01","reportingCurrency":"USD"}',
  workflow_defaults = '{
    "accounting.journal_posting":     {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "accounting.period_close":        {"autoMode":false, "approvalRequired":true,  "userVisible":true},
    "accounting.bank_reconciliation": {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "accounting.eod_reconciliation":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "accounting.revenue_recognition": {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "accounting.depreciation":        {"autoMode":true,  "approvalRequired":false, "userVisible":false},
    "payments.settlement_matching":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.tip_payout":            {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.cash_variance_alert":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.deposit_verification":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "inventory.costing":              {"autoMode":true,  "approvalRequired":false, "userVisible":false},
    "inventory.reorder_alerts":       {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ap.bill_approval":               {"autoMode":true,  "approvalRequired":false, "userVisible":false},
    "ap.payment_approval":            {"autoMode":true,  "approvalRequired":false, "userVisible":false},
    "ar.invoice_posting":             {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.late_fee_assessment":         {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.credit_hold":                 {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.dunning":                     {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.recurring_invoices":          {"autoMode":true,  "approvalRequired":false, "userVisible":false}
  }',
  validation_status = 'valid',
  updated_at = now()
WHERE business_type_version_id = '01JQXBT000BTVER_HOTEL000';

-- Restaurant: F&B focused — perpetual COGS (food cost is king), tips/cash variance visible,
-- reorder alerts for perishable inventory, no deferred revenue
UPDATE business_type_accounting_templates SET
  revenue_categories = '{"foodRevenue":"SALES_FOOD","beverageRevenue":"SALES_BEVERAGE_ALCOHOL","retailRevenue":"SALES_RETAIL"}',
  payment_gl_mappings = '{"cash":"CASH_OPERATING","creditCard":"MERCHANT_CLEARING","giftCard":"GIFT_CARD_CLEARING"}',
  tax_behavior = '{"defaultTaxInclusive":false,"separateTaxLiability":true}',
  deferred_revenue = '{"enabled":false}',
  cogs_behavior = 'perpetual',
  fiscal_settings = '{"fiscalYearStart":"01-01","reportingCurrency":"USD"}',
  workflow_defaults = '{
    "accounting.period_close":        {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "accounting.eod_reconciliation":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.tip_payout":            {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.cash_variance_alert":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "inventory.reorder_alerts":       {"autoMode":true,  "approvalRequired":false, "userVisible":true}
  }',
  validation_status = 'valid',
  updated_at = now()
WHERE business_type_version_id = '01JQXBT000BTVER_RESTAURA';

-- Retail: simplest accounting — periodic COGS (monthly/quarterly counts),
-- cash variance alerts visible, reorder alerts for stock management
UPDATE business_type_accounting_templates SET
  revenue_categories = '{"retailRevenue":"SALES_RETAIL"}',
  payment_gl_mappings = '{"cash":"CASH_OPERATING","creditCard":"MERCHANT_CLEARING","giftCard":"GIFT_CARD_CLEARING"}',
  tax_behavior = '{"defaultTaxInclusive":false,"separateTaxLiability":true}',
  deferred_revenue = '{"enabled":false}',
  cogs_behavior = 'periodic',
  fiscal_settings = '{"fiscalYearStart":"01-01","reportingCurrency":"USD"}',
  workflow_defaults = '{
    "accounting.period_close":        {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "payments.cash_variance_alert":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "inventory.reorder_alerts":       {"autoMode":true,  "approvalRequired":false, "userVisible":true}
  }',
  validation_status = 'valid',
  updated_at = now()
WHERE business_type_version_id = '01JQXBT000BTVER_RETAIL00';

-- Golf / Country Club: complex member billing — perpetual COGS for F&B + pro shop,
-- deferred revenue for dues/prepaid rounds, period close requires approval (board scrutiny),
-- ALL AR workflows visible (member billing is core ops), AP visible for course maintenance
UPDATE business_type_accounting_templates SET
  revenue_categories = '{"retailRevenue":"SALES_RETAIL","foodRevenue":"SALES_FOOD","beverageRevenue":"SALES_BEVERAGE_ALCOHOL","serviceRevenue":"SALES_SERVICE"}',
  payment_gl_mappings = '{"cash":"CASH_OPERATING","creditCard":"MERCHANT_CLEARING","giftCard":"GIFT_CARD_CLEARING","memberCharge":"AR_HOUSE"}',
  tax_behavior = '{"defaultTaxInclusive":false,"separateTaxLiability":true}',
  deferred_revenue = '{"enabled":true,"liabilityAccount":"DEFERRED_REVENUE"}',
  cogs_behavior = 'perpetual',
  fiscal_settings = '{"fiscalYearStart":"01-01","reportingCurrency":"USD"}',
  workflow_defaults = '{
    "accounting.journal_posting":     {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "accounting.period_close":        {"autoMode":false, "approvalRequired":true,  "userVisible":true},
    "accounting.bank_reconciliation": {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "accounting.eod_reconciliation":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "accounting.revenue_recognition": {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.settlement_matching":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.tip_payout":            {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.cash_variance_alert":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.deposit_verification":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "inventory.reorder_alerts":       {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ap.bill_approval":               {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ap.payment_approval":            {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.invoice_posting":             {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.late_fee_assessment":         {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.credit_hold":                 {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.dunning":                     {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.recurring_invoices":          {"autoMode":true,  "approvalRequired":false, "userVisible":true}
  }',
  validation_status = 'valid',
  updated_at = now()
WHERE business_type_version_id = '01JQXBT000BTVER_GOLF0000';

-- Spa: service business — COGS disabled (not product-based), deferred revenue for
-- prepaid packages, simple accounting with cash variance visible
UPDATE business_type_accounting_templates SET
  revenue_categories = '{"serviceRevenue":"SALES_SERVICE","retailRevenue":"SALES_RETAIL"}',
  payment_gl_mappings = '{"cash":"CASH_OPERATING","creditCard":"MERCHANT_CLEARING","giftCard":"GIFT_CARD_CLEARING"}',
  tax_behavior = '{"defaultTaxInclusive":false,"separateTaxLiability":true}',
  deferred_revenue = '{"enabled":true,"liabilityAccount":"DEFERRED_REVENUE"}',
  cogs_behavior = 'disabled',
  fiscal_settings = '{"fiscalYearStart":"01-01","reportingCurrency":"USD"}',
  workflow_defaults = '{
    "accounting.period_close":        {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "payments.cash_variance_alert":   {"autoMode":true,  "approvalRequired":false, "userVisible":true}
  }',
  validation_status = 'valid',
  updated_at = now()
WHERE business_type_version_id = '01JQXBT000BTVER_SPA00000';

-- Hybrid: mid-complexity multi-vertical — perpetual COGS for F&B, deferred revenue for
-- spa packages and events, AR visible for corporate billing, bank recon manual
UPDATE business_type_accounting_templates SET
  revenue_categories = '{"retailRevenue":"SALES_RETAIL","foodRevenue":"SALES_FOOD","beverageRevenue":"SALES_BEVERAGE_ALCOHOL","serviceRevenue":"SALES_SERVICE"}',
  payment_gl_mappings = '{"cash":"CASH_OPERATING","creditCard":"MERCHANT_CLEARING","giftCard":"GIFT_CARD_CLEARING","memberCharge":"AR_HOUSE"}',
  tax_behavior = '{"defaultTaxInclusive":false,"separateTaxLiability":true}',
  deferred_revenue = '{"enabled":true,"liabilityAccount":"DEFERRED_REVENUE"}',
  cogs_behavior = 'perpetual',
  fiscal_settings = '{"fiscalYearStart":"01-01","reportingCurrency":"USD"}',
  workflow_defaults = '{
    "accounting.journal_posting":     {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "accounting.period_close":        {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "accounting.bank_reconciliation": {"autoMode":false, "approvalRequired":false, "userVisible":true},
    "accounting.eod_reconciliation":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.settlement_matching":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.tip_payout":            {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.cash_variance_alert":   {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "payments.deposit_verification":  {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "inventory.reorder_alerts":       {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.invoice_posting":             {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.late_fee_assessment":         {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.credit_hold":                 {"autoMode":true,  "approvalRequired":false, "userVisible":true},
    "ar.dunning":                     {"autoMode":true,  "approvalRequired":false, "userVisible":true}
  }',
  validation_status = 'valid',
  updated_at = now()
WHERE business_type_version_id = '01JQXBT000BTVER_HYBRID00';


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: ROLE TEMPLATES PER BUSINESS TYPE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 3A. Hotel Roles (12) ──────────────────────────────────────────────────────
INSERT INTO business_type_role_templates (id, business_type_version_id, role_name, role_key, description, sort_order, is_active)
VALUES
  ('01JQXBT000BTROLE_HTL_SA0', '01JQXBT000BTVER_HOTEL000', 'Super Admin',              'super_admin',             'Full unrestricted access — auto-includes new permissions',                  0,  true),
  ('01JQXBT000BTROLE_HTL_GM0', '01JQXBT000BTVER_HOTEL000', 'General Manager',          'general_manager',         'Full operational control across all departments',                          1,  true),
  ('01JQXBT000BTROLE_HTL_FOM', '01JQXBT000BTVER_HOTEL000', 'Front Office Manager',     'front_office_manager',    'Oversees front desk, reservations, guest services, and billing',           2,  true),
  ('01JQXBT000BTROLE_HTL_FBM', '01JQXBT000BTVER_HOTEL000', 'F&B Manager',              'fnb_manager',             'Manages all food & beverage operations, kitchen, bars, and banquets',      3,  true),
  ('01JQXBT000BTROLE_HTL_REV', '01JQXBT000BTVER_HOTEL000', 'Revenue Manager',          'revenue_manager',         'Pricing strategy, revenue optimization, and forecasting',                  4,  true),
  ('01JQXBT000BTROLE_HTL_FDA', '01JQXBT000BTVER_HOTEL000', 'Front Desk Agent',         'front_desk_agent',        'Check-in/out, reservations, folios, and guest profiles',                   5,  true),
  ('01JQXBT000BTROLE_HTL_HKS', '01JQXBT000BTVER_HOTEL000', 'Housekeeping Supervisor',  'housekeeping_supervisor', 'Room status, housekeeping assignments, and inspections',                   6,  true),
  ('01JQXBT000BTROLE_HTL_SRV', '01JQXBT000BTVER_HOTEL000', 'Server',                   'server',                  'F&B order entry, payments, and table service',                             7,  true),
  ('01JQXBT000BTROLE_HTL_CHF', '01JQXBT000BTVER_HOTEL000', 'Chef',                     'chef',                    'Kitchen operations, KDS management, menu control, and food inventory',     8,  true),
  ('01JQXBT000BTROLE_HTL_COK', '01JQXBT000BTVER_HOTEL000', 'Cook',                     'cook',                    'KDS view and bump, catalog view — line cook / prep cook',                  9,  true),
  ('01JQXBT000BTROLE_HTL_SPT', '01JQXBT000BTVER_HOTEL000', 'Spa Therapist',            'spa_therapist',           'View appointments, manage clinical notes and intake forms',               10,  true),
  ('01JQXBT000BTROLE_HTL_NAD', '01JQXBT000BTVER_HOTEL000', 'Night Auditor',            'night_auditor',           'End-of-day reconciliation, close batches, and overnight reporting',       11,  true)
ON CONFLICT (business_type_version_id, role_key) DO NOTHING;

-- ── 3B. Restaurant Roles (10) ──────────────────────────────────────────────────
INSERT INTO business_type_role_templates (id, business_type_version_id, role_name, role_key, description, sort_order, is_active)
VALUES
  ('01JQXBT000BTROLE_RST_SA0', '01JQXBT000BTVER_RESTAURA', 'Super Admin',       'super_admin',      'Full unrestricted access — auto-includes new permissions',            0, true),
  ('01JQXBT000BTROLE_RST_GM0', '01JQXBT000BTVER_RESTAURA', 'General Manager',   'general_manager',  'Full operational and financial control',                              1, true),
  ('01JQXBT000BTROLE_RST_FLR', '01JQXBT000BTVER_RESTAURA', 'Floor Manager',     'floor_manager',    'Shift-level operations: orders, voids, comps, tips, cash, KDS',      2, true),
  ('01JQXBT000BTROLE_RST_KIT', '01JQXBT000BTVER_RESTAURA', 'Kitchen Manager',   'kitchen_manager',  'KDS management, inventory, menu 86/restore, food prep',              3, true),
  ('01JQXBT000BTROLE_RST_BAR', '01JQXBT000BTVER_RESTAURA', 'Bartender',         'bartender',        'Bar service, tabs, payments, tips, and cash drawer',                 4, true),
  ('01JQXBT000BTROLE_RST_SRV', '01JQXBT000BTVER_RESTAURA', 'Server',            'server',           'Table service, order entry, payments, and tip management',           5, true),
  ('01JQXBT000BTROLE_RST_CHF', '01JQXBT000BTVER_RESTAURA', 'Chef',              'chef',             'Kitchen operations, KDS management, menu control, and food inventory', 6, true),
  ('01JQXBT000BTROLE_RST_COK', '01JQXBT000BTVER_RESTAURA', 'Cook',              'cook',             'KDS view and bump, catalog view — line cook / prep cook',            7, true),
  ('01JQXBT000BTROLE_RST_HST', '01JQXBT000BTVER_RESTAURA', 'Host',              'host',             'Reservations, waitlist management, and guest seating',               8, true),
  ('01JQXBT000BTROLE_RST_CSH', '01JQXBT000BTVER_RESTAURA', 'Cashier',           'cashier',          'Counter-service register, takeout orders, and cash drawer',          9, true)
ON CONFLICT (business_type_version_id, role_key) DO NOTHING;

-- ── 3C. Retail Roles (6) ─────────────────────────────────────────────────────
INSERT INTO business_type_role_templates (id, business_type_version_id, role_name, role_key, description, sort_order, is_active)
VALUES
  ('01JQXBT000BTROLE_RTL_SA0', '01JQXBT000BTVER_RETAIL00', 'Super Admin',        'super_admin',       'Full unrestricted access — auto-includes new permissions',            0, true),
  ('01JQXBT000BTROLE_RTL_SM0', '01JQXBT000BTVER_RETAIL00', 'Store Manager',      'store_manager',     'Full store operations, accounting, user management, and reporting',   1, true),
  ('01JQXBT000BTROLE_RTL_AM0', '01JQXBT000BTVER_RETAIL00', 'Assistant Manager',  'assistant_manager', 'Shift management: returns, overrides, inventory, and reporting',      2, true),
  ('01JQXBT000BTROLE_RTL_CSH', '01JQXBT000BTVER_RETAIL00', 'Cashier',            'cashier',           'POS transactions, payments, cash drawer, and customer lookup',        3, true),
  ('01JQXBT000BTROLE_RTL_STK', '01JQXBT000BTVER_RETAIL00', 'Stock Clerk',        'stock_clerk',       'Receiving, stock adjustments, transfers, and cycle counts',           4, true),
  ('01JQXBT000BTROLE_RTL_SLA', '01JQXBT000BTVER_RETAIL00', 'Sales Associate',    'sales_associate',   'Customer-facing sales, order entry, and customer assistance',         5, true)
ON CONFLICT (business_type_version_id, role_key) DO NOTHING;

-- ── 3D. Golf / Country Club Roles (8) ─────────────────────────────────────────
INSERT INTO business_type_role_templates (id, business_type_version_id, role_name, role_key, description, sort_order, is_active)
VALUES
  ('01JQXBT000BTROLE_GLF_SA0', '01JQXBT000BTVER_GOLF0000', 'Super Admin',           'super_admin',          'Full unrestricted access — auto-includes new permissions',            0, true),
  ('01JQXBT000BTROLE_GLF_GM0', '01JQXBT000BTVER_GOLF0000', 'General Manager',       'general_manager',      'Full club operations, financials, and staff management',              1, true),
  ('01JQXBT000BTROLE_GLF_CTR', '01JQXBT000BTVER_GOLF0000', 'Club Controller',       'club_controller',      'Accounting, AP/AR, member billing, financial reporting',              2, true),
  ('01JQXBT000BTROLE_GLF_FBM', '01JQXBT000BTVER_GOLF0000', 'F&B Manager',           'fnb_manager',          'Clubhouse F&B operations, kitchen, bar, and catering',               3, true),
  ('01JQXBT000BTROLE_GLF_PSM', '01JQXBT000BTVER_GOLF0000', 'Pro Shop Manager',      'pro_shop_manager',     'Pro shop retail, inventory, catalog management, and reporting',       4, true),
  ('01JQXBT000BTROLE_GLF_MBR', '01JQXBT000BTVER_GOLF0000', 'Membership Director',   'membership_director',  'Member relations, billing, AR, and membership analytics',             5, true),
  ('01JQXBT000BTROLE_GLF_SRV', '01JQXBT000BTVER_GOLF0000', 'Server',                'server',               'Clubhouse F&B table service, orders, and payments',                  6, true),
  ('01JQXBT000BTROLE_GLF_PSA', '01JQXBT000BTVER_GOLF0000', 'Pro Shop Attendant',    'pro_shop_attendant',   'Pro shop register, member lookups, and basic transactions',           7, true)
ON CONFLICT (business_type_version_id, role_key) DO NOTHING;

-- ── 3E. Spa Roles (5) ────────────────────────────────────────────────────────
INSERT INTO business_type_role_templates (id, business_type_version_id, role_name, role_key, description, sort_order, is_active)
VALUES
  ('01JQXBT000BTROLE_SPA_SA0', '01JQXBT000BTVER_SPA00000', 'Super Admin',             'super_admin',            'Full unrestricted access — auto-includes new permissions',            0, true),
  ('01JQXBT000BTROLE_SPA_DIR', '01JQXBT000BTVER_SPA00000', 'Spa Director',            'spa_director',           'Full spa operations, accounting, staff, and reporting',               1, true),
  ('01JQXBT000BTROLE_SPA_FDC', '01JQXBT000BTVER_SPA00000', 'Front Desk Coordinator',  'front_desk_coordinator', 'Appointments, packages, waitlist, customer management, and POS',      2, true),
  ('01JQXBT000BTROLE_SPA_THR', '01JQXBT000BTVER_SPA00000', 'Therapist',               'therapist',              'View schedule, manage clinical notes and intake forms',               3, true),
  ('01JQXBT000BTROLE_SPA_RCP', '01JQXBT000BTVER_SPA00000', 'Receptionist',            'receptionist',           'Book appointments, process payments, and customer check-in',          4, true)
ON CONFLICT (business_type_version_id, role_key) DO NOTHING;

-- ── 3F. Hybrid / Multi-Purpose Venue Roles (10) ───────────────────────────────
INSERT INTO business_type_role_templates (id, business_type_version_id, role_name, role_key, description, sort_order, is_active)
VALUES
  ('01JQXBT000BTROLE_HYB_SA0', '01JQXBT000BTVER_HYBRID00', 'Super Admin',        'super_admin',        'Full unrestricted access — auto-includes new permissions',            0, true),
  ('01JQXBT000BTROLE_HYB_GM0', '01JQXBT000BTVER_HYBRID00', 'General Manager',    'general_manager',    'Full venue operations, financials, and staff management',             1, true),
  ('01JQXBT000BTROLE_HYB_OPS', '01JQXBT000BTVER_HYBRID00', 'Operations Manager', 'operations_manager', 'Day-to-day operations across retail, F&B, and spa',                  2, true),
  ('01JQXBT000BTROLE_HYB_FBM', '01JQXBT000BTVER_HYBRID00', 'F&B Manager',        'fnb_manager',        'Food & beverage operations, kitchen, and bar management',             3, true),
  ('01JQXBT000BTROLE_HYB_SPM', '01JQXBT000BTVER_HYBRID00', 'Spa Manager',        'spa_manager',        'Spa operations, providers, commissions, and reporting',               4, true),
  ('01JQXBT000BTROLE_HYB_CHF', '01JQXBT000BTVER_HYBRID00', 'Chef',               'chef',               'Kitchen operations, KDS management, menu control, and food inventory', 5, true),
  ('01JQXBT000BTROLE_HYB_COK', '01JQXBT000BTVER_HYBRID00', 'Cook',               'cook',               'KDS view and bump, catalog view — line cook / prep cook',            6, true),
  ('01JQXBT000BTROLE_HYB_CSH', '01JQXBT000BTVER_HYBRID00', 'Cashier',            'cashier',            'Multi-department register: retail, F&B counter, and spa checkout',    7, true),
  ('01JQXBT000BTROLE_HYB_SRV', '01JQXBT000BTVER_HYBRID00', 'Server',             'server',             'F&B table service, order entry, and payments',                       8, true),
  ('01JQXBT000BTROLE_HYB_STF', '01JQXBT000BTVER_HYBRID00', 'Staff',              'staff',              'View-only access across departments',                                9, true)
ON CONFLICT (business_type_version_id, role_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: ROLE PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 4A. Super Admin — ALL 159 permissions (all business types) ────────────────
DO $$
DECLARE
  v_role_id text;
  v_perm text;
  v_all_perms text[] := ARRAY[
    'dashboard.view','dashboard.configure','settings.view','settings.update',
    'users.view','users.manage','modules.manage','audit.view',
    'catalog.view','catalog.manage',
    'orders.view','orders.create','orders.manage','orders.void',
    'returns.create','price.override','discounts.apply','charges.manage',
    'tenders.view','tenders.create','tenders.adjust','tenders.refund',
    'shift.manage','cash.drawer','cash.drop',
    'pos.register_tabs.view_all','pos.register_tabs.transfer',
    'inventory.view','inventory.manage',
    'customers.view','customers.manage','billing.view','billing.manage',
    'reports.view','reports.export','reports.custom.view','reports.custom.manage',
    'accounting.view','accounting.manage','accounting.mappings.manage',
    'accounting.period.close','accounting.banking.view','accounting.banking.reconcile',
    'accounting.tax.view','accounting.financials.view','accounting.revenue.view',
    'cogs.manage','expenses.view','expenses.create','expenses.approve','expenses.manage',
    'project_costing.view','project_costing.manage',
    'ap.view','ap.manage','ar.view','ar.manage',
    'room_layouts.view','room_layouts.manage',
    'semantic.view','semantic.query','semantic.manage','semantic.admin',
    'pos_fnb.floor_plan.view','pos_fnb.floor_plan.manage',
    'pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.transfer',
    'pos_fnb.tabs.void','pos_fnb.tabs.manage','pos_fnb.tabs.manage_bulk_all_servers',
    'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage',
    'pos_fnb.kds.settings.manage',
    'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
    'pos_fnb.payments.create','pos_fnb.payments.split','pos_fnb.payments.refund','pos_fnb.payments.void',
    'pos_fnb.tips.adjust','pos_fnb.tips.finalize','pos_fnb.tips.pool_manage','pos_fnb.tips.manage',
    'pos_fnb.menu.manage','pos_fnb.menu.comp','pos_fnb.menu.discount','pos_fnb.menu.price_override',
    'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
    'pos_fnb.reports.view','pos_fnb.reports.export',
    'pos_fnb.settings.manage',
    'pos_fnb.gl.view','pos_fnb.gl.manage','pos_fnb.gl.post','pos_fnb.gl.reverse','pos_fnb.gl.mappings',
    'pos_fnb.inventory.view','pos_fnb.inventory.manage',
    'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics',
    'pms.property.view','pms.property.manage',
    'pms.rooms.view','pms.rooms.manage',
    'pms.reservations.view','pms.reservations.create','pms.reservations.edit','pms.reservations.cancel',
    'pms.front_desk.check_in','pms.front_desk.check_out','pms.front_desk.no_show',
    'pms.calendar.view','pms.calendar.move','pms.calendar.resize',
    'pms.housekeeping.view','pms.housekeeping.manage',
    'pms.guests.view','pms.guests.manage',
    'pms.folio.view','pms.folio.post_charges','pms.folio.post_payments',
    'pms.rates.view','pms.rates.manage',
    'pms.housekeepers.manage','pms.reports.view',
    'spa.services.view','spa.services.manage',
    'spa.providers.view','spa.providers.manage',
    'spa.resources.view','spa.resources.manage',
    'spa.appointments.view','spa.appointments.create','spa.appointments.manage','spa.appointments.cancel',
    'spa.packages.view','spa.packages.manage',
    'spa.commissions.view','spa.commissions.manage',
    'spa.intake.view','spa.intake.manage',
    'spa.clinical_notes.manage',
    'spa.settings.view','spa.settings.manage',
    'spa.reports.view','spa.reports.export',
    'spa.waitlist.view','spa.waitlist.manage',
    'spa.booking.manage','spa.operations.manage'
  ];
BEGIN
  FOR v_role_id IN SELECT id FROM business_type_role_templates WHERE role_key = 'super_admin' LOOP
    FOREACH v_perm IN ARRAY v_all_perms LOOP
      INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
      VALUES (gen_ulid(), v_role_id, v_perm)
      ON CONFLICT (role_template_id, permission_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ── 4B. General Manager / Store Manager / Spa Director ────────────────────────
-- These get all Super Admin permissions MINUS: modules.manage, accounting.period.close, semantic.admin
DO $$
DECLARE
  v_gm_ids text[] := ARRAY[
    '01JQXBT000BTROLE_HTL_GM0',  -- Hotel GM
    '01JQXBT000BTROLE_RST_GM0',  -- Restaurant GM
    '01JQXBT000BTROLE_RTL_SM0',  -- Retail Store Manager
    '01JQXBT000BTROLE_GLF_GM0',  -- Golf GM
    '01JQXBT000BTROLE_SPA_DIR',  -- Spa Director
    '01JQXBT000BTROLE_HYB_GM0'   -- Hybrid GM
  ];
  v_excluded text[] := ARRAY['modules.manage', 'accounting.period.close', 'semantic.admin'];
  v_gm_id text;
  v_sa_id text;
  v_perm record;
BEGIN
  FOREACH v_gm_id IN ARRAY v_gm_ids LOOP
    -- Find the super_admin for the same business type version
    SELECT sa.id INTO v_sa_id
    FROM business_type_role_templates sa
    WHERE sa.business_type_version_id = (
      SELECT business_type_version_id FROM business_type_role_templates WHERE id = v_gm_id
    )
    AND sa.role_key = 'super_admin';

    IF v_sa_id IS NOT NULL THEN
      FOR v_perm IN
        SELECT permission_key FROM business_type_role_permissions
        WHERE role_template_id = v_sa_id
        AND permission_key <> ALL(v_excluded)
      LOOP
        INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
        VALUES (gen_ulid(), v_gm_id, v_perm.permission_key)
        ON CONFLICT (role_template_id, permission_key) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4C. HOTEL SPECIALTY ROLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Hotel: Front Office Manager — PMS, customers, billing, reporting, payments, spa booking
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_FOM', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','users.view','audit.view',
  'customers.view','customers.manage','billing.view','billing.manage',
  'pms.property.view','pms.property.manage','pms.rooms.view','pms.rooms.manage',
  'pms.reservations.view','pms.reservations.create','pms.reservations.edit','pms.reservations.cancel',
  'pms.front_desk.check_in','pms.front_desk.check_out','pms.front_desk.no_show',
  'pms.calendar.view','pms.calendar.move','pms.calendar.resize',
  'pms.housekeeping.view','pms.housekeeping.manage','pms.housekeepers.manage',
  'pms.guests.view','pms.guests.manage',
  'pms.folio.view','pms.folio.post_charges','pms.folio.post_payments',
  'pms.rates.view','pms.rates.manage','pms.reports.view',
  'reports.view','reports.export','reports.custom.view',
  'accounting.view','accounting.financials.view',
  'ar.view',
  'tenders.view','tenders.create',
  'orders.view','orders.create',
  'room_layouts.view',
  'spa.appointments.view','spa.appointments.create'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: F&B Manager — full F&B POS, KDS, inventory, catalog, tips, GL posting
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_FBM', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage','orders.void',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage',
  'reports.view','reports.export',
  'room_layouts.view','room_layouts.manage',
  'pos_fnb.floor_plan.view','pos_fnb.floor_plan.manage',
  'pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.transfer',
  'pos_fnb.tabs.void','pos_fnb.tabs.manage','pos_fnb.tabs.manage_bulk_all_servers',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split','pos_fnb.payments.refund','pos_fnb.payments.void',
  'pos_fnb.tips.adjust','pos_fnb.tips.finalize','pos_fnb.tips.pool_manage','pos_fnb.tips.manage',
  'pos_fnb.menu.manage','pos_fnb.menu.comp','pos_fnb.menu.discount','pos_fnb.menu.price_override',
  'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
  'pos_fnb.reports.view','pos_fnb.reports.export',
  'pos_fnb.settings.manage',
  'pos_fnb.gl.view','pos_fnb.gl.manage','pos_fnb.gl.post','pos_fnb.gl.reverse','pos_fnb.gl.mappings',
  'pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Revenue Manager — pricing, forecasting, analytics
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_REV', unnest(ARRAY[
  'dashboard.view','dashboard.configure',
  'reports.view','reports.export','reports.custom.view','reports.custom.manage',
  'semantic.view','semantic.query','semantic.manage',
  'pms.property.view','pms.rates.view','pms.rates.manage',
  'pms.reports.view','pms.reservations.view','pms.calendar.view',
  'accounting.view','accounting.financials.view','accounting.revenue.view','accounting.tax.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Front Desk Agent — check-in/out, reservations, folios, guests
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_FDA', unnest(ARRAY[
  'dashboard.view',
  'customers.view','customers.manage',
  'pms.property.view','pms.rooms.view',
  'pms.reservations.view','pms.reservations.create','pms.reservations.edit','pms.reservations.cancel',
  'pms.front_desk.check_in','pms.front_desk.check_out','pms.front_desk.no_show',
  'pms.calendar.view','pms.calendar.move','pms.calendar.resize',
  'pms.guests.view','pms.guests.manage',
  'pms.folio.view','pms.folio.post_charges','pms.folio.post_payments',
  'pms.housekeeping.view',
  'tenders.view','tenders.create',
  'orders.view','orders.create',
  'room_layouts.view',
  'spa.appointments.view','spa.appointments.create'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Housekeeping Supervisor — rooms and housekeeping management
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_HKS', unnest(ARRAY[
  'dashboard.view',
  'pms.property.view','pms.rooms.view',
  'pms.housekeeping.view','pms.housekeeping.manage','pms.housekeepers.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Server — F&B table service
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_SRV', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create','tenders.adjust',
  'cash.drawer','shift.manage',
  'customers.view',
  'room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split',
  'pos_fnb.tips.adjust','pos_fnb.menu.discount',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.host.view','pos_fnb.inventory.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Spa Therapist — appointments, clinical notes, intake
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_SPT', unnest(ARRAY[
  'dashboard.view','customers.view',
  'spa.services.view','spa.providers.view','spa.resources.view',
  'spa.appointments.view','spa.appointments.manage',
  'spa.clinical_notes.manage',
  'spa.intake.view','spa.intake.manage',
  'spa.packages.view','spa.operations.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Night Auditor — EOD reconciliation, close batches, reporting
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_NAD', unnest(ARRAY[
  'dashboard.view',
  'accounting.view','accounting.banking.view','accounting.financials.view',
  'accounting.revenue.view','accounting.tax.view',
  'reports.view','reports.export',
  'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
  'pos_fnb.gl.view','pos_fnb.reports.view',
  'pms.property.view','pms.rooms.view','pms.reservations.view',
  'pms.folio.view','pms.reports.view',
  'tenders.view','cash.drop'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Chef — kitchen operations, KDS management, menu control, inventory
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_CHF', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'inventory.view','inventory.manage',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'pos_fnb.menu.manage','pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.tabs.view','pos_fnb.reports.view',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'reports.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hotel: Cook — KDS view/bump, catalog view (line cook / prep cook)
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HTL_COK', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.inventory.view','pos_fnb.tabs.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4D. RESTAURANT SPECIALTY ROLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Restaurant: Floor Manager — full shift operations
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_FLR', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage','orders.void',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage',
  'reports.view','reports.export',
  'room_layouts.view','room_layouts.manage',
  'pos_fnb.floor_plan.view','pos_fnb.floor_plan.manage',
  'pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.transfer',
  'pos_fnb.tabs.void','pos_fnb.tabs.manage','pos_fnb.tabs.manage_bulk_all_servers',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage',
  'kds.view','kds.bump','kds.recall','kds.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split','pos_fnb.payments.refund','pos_fnb.payments.void',
  'pos_fnb.tips.adjust','pos_fnb.tips.finalize','pos_fnb.tips.pool_manage','pos_fnb.tips.manage',
  'pos_fnb.menu.manage','pos_fnb.menu.comp','pos_fnb.menu.discount','pos_fnb.menu.price_override',
  'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
  'pos_fnb.reports.view','pos_fnb.reports.export',
  'pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Kitchen Manager — back of house
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_KIT', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'inventory.view','inventory.manage',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'pos_fnb.menu.manage','pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.tabs.view','pos_fnb.reports.view',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Bartender — bar service with cash handling
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_BAR', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create','orders.manage',
  'tenders.view','tenders.create','tenders.adjust',
  'shift.manage','cash.drawer','cash.drop',
  'discounts.apply','customers.view',
  'room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split',
  'pos_fnb.tips.adjust','pos_fnb.tips.manage','pos_fnb.menu.discount',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.inventory.view','pos_fnb.close_batch.cash_count','pos_fnb.host.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Server — table service
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_SRV', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create','tenders.adjust',
  'cash.drawer','shift.manage',
  'customers.view','room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split',
  'pos_fnb.tips.adjust','pos_fnb.menu.discount',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.host.view','pos_fnb.inventory.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Host — reservations, waitlist, seating
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_HST', unnest(ARRAY[
  'dashboard.view',
  'customers.view','customers.manage',
  'room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view',
  'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Cashier — counter/takeout register
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_CSH', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create','orders.manage',
  'tenders.view','tenders.create',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all',
  'customers.view','discounts.apply'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Chef — kitchen operations, KDS management, menu control, inventory
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_CHF', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'inventory.view','inventory.manage',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'pos_fnb.menu.manage','pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.tabs.view','pos_fnb.reports.view',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'reports.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Restaurant: Cook — KDS view/bump, catalog view (line cook / prep cook)
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RST_COK', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.inventory.view','pos_fnb.tabs.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4E. RETAIL SPECIALTY ROLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Retail: Assistant Manager — shift management, returns, overrides
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RTL_AM0', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','users.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage',
  'reports.view','reports.export'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Retail: Cashier — register operations
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RTL_CSH', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create','orders.manage',
  'tenders.view','tenders.create',
  'shift.manage','cash.drawer',
  'pos.register_tabs.view_all',
  'customers.view','customers.manage',
  'discounts.apply'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Retail: Stock Clerk — inventory focused
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RTL_STK', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'inventory.view','inventory.manage',
  'customers.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Retail: Sales Associate — customer-facing sales
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_RTL_SLA', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create',
  'cash.drawer','shift.manage',
  'customers.view','discounts.apply'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4F. GOLF / COUNTRY CLUB SPECIALTY ROLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Golf: Club Controller — finance/accounting specialist
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_GLF_CTR', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'accounting.view','accounting.manage','accounting.mappings.manage',
  'accounting.banking.view','accounting.banking.reconcile',
  'accounting.tax.view','accounting.financials.view','accounting.revenue.view',
  'cogs.manage','expenses.view','expenses.create','expenses.approve','expenses.manage',
  'project_costing.view','project_costing.manage',
  'ap.view','ap.manage','ar.view','ar.manage',
  'customers.view','customers.manage','billing.view','billing.manage',
  'reports.view','reports.export','reports.custom.view','reports.custom.manage',
  'semantic.view','semantic.query'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Golf: F&B Manager — clubhouse restaurant and bar
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_GLF_FBM', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage','orders.void',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage',
  'reports.view','reports.export',
  'room_layouts.view','room_layouts.manage',
  'pos_fnb.floor_plan.view','pos_fnb.floor_plan.manage',
  'pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.transfer',
  'pos_fnb.tabs.void','pos_fnb.tabs.manage','pos_fnb.tabs.manage_bulk_all_servers',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split','pos_fnb.payments.refund','pos_fnb.payments.void',
  'pos_fnb.tips.adjust','pos_fnb.tips.finalize','pos_fnb.tips.pool_manage','pos_fnb.tips.manage',
  'pos_fnb.menu.manage','pos_fnb.menu.comp','pos_fnb.menu.discount','pos_fnb.menu.price_override',
  'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
  'pos_fnb.reports.view','pos_fnb.reports.export',
  'pos_fnb.settings.manage',
  'pos_fnb.gl.view','pos_fnb.gl.manage','pos_fnb.gl.post','pos_fnb.gl.reverse','pos_fnb.gl.mappings',
  'pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Golf: Pro Shop Manager — retail operations
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_GLF_PSM', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage','orders.void',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage',
  'reports.view','reports.export'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Golf: Membership Director — member relations, billing, AR
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_GLF_MBR', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'customers.view','customers.manage','billing.view','billing.manage',
  'ar.view','ar.manage',
  'reports.view','reports.export','reports.custom.view',
  'semantic.view','semantic.query',
  'accounting.view','accounting.financials.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Golf: Server — clubhouse F&B service (same as restaurant server)
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_GLF_SRV', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create','tenders.adjust',
  'cash.drawer','shift.manage',
  'customers.view','room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split',
  'pos_fnb.tips.adjust','pos_fnb.menu.discount',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.host.view','pos_fnb.inventory.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Golf: Pro Shop Attendant — register cashier
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_GLF_PSA', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create','orders.manage',
  'tenders.view','tenders.create',
  'shift.manage','cash.drawer',
  'customers.view','discounts.apply'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4G. SPA SPECIALTY ROLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Spa: Front Desk Coordinator — appointments, packages, POS, waitlist
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_SPA_FDC', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view',
  'catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create',
  'shift.manage','cash.drawer',
  'customers.view','customers.manage',
  'reports.view',
  'spa.services.view','spa.providers.view','spa.resources.view',
  'spa.appointments.view','spa.appointments.create','spa.appointments.manage','spa.appointments.cancel',
  'spa.packages.view','spa.packages.manage',
  'spa.waitlist.view','spa.waitlist.manage',
  'spa.booking.manage','spa.operations.manage',
  'spa.commissions.view','spa.intake.view',
  'spa.reports.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Spa: Therapist — appointments, clinical notes, intake
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_SPA_THR', unnest(ARRAY[
  'dashboard.view','customers.view',
  'spa.services.view','spa.providers.view','spa.resources.view',
  'spa.appointments.view','spa.appointments.manage',
  'spa.clinical_notes.manage',
  'spa.intake.view','spa.intake.manage',
  'spa.packages.view','spa.operations.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Spa: Receptionist — simpler than coordinator, booking + payments focus
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_SPA_RCP', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create',
  'cash.drawer','shift.manage',
  'customers.view','customers.manage',
  'spa.services.view','spa.appointments.view','spa.appointments.create',
  'spa.packages.view','spa.waitlist.view','spa.waitlist.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4H. HYBRID / MULTI-PURPOSE VENUE SPECIALTY ROLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Hybrid: Operations Manager — all operational modules (retail, F&B, spa), no accounting
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_OPS', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','users.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage','orders.void',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage','billing.view','billing.manage',
  'reports.view','reports.export','reports.custom.view','reports.custom.manage',
  'room_layouts.view','room_layouts.manage',
  'pos_fnb.floor_plan.view','pos_fnb.floor_plan.manage',
  'pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.transfer',
  'pos_fnb.tabs.void','pos_fnb.tabs.manage','pos_fnb.tabs.manage_bulk_all_servers',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split','pos_fnb.payments.refund','pos_fnb.payments.void',
  'pos_fnb.tips.adjust','pos_fnb.tips.finalize','pos_fnb.tips.pool_manage','pos_fnb.tips.manage',
  'pos_fnb.menu.manage','pos_fnb.menu.comp','pos_fnb.menu.discount','pos_fnb.menu.price_override',
  'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
  'pos_fnb.reports.view','pos_fnb.reports.export',
  'pos_fnb.settings.manage',
  'pos_fnb.gl.view',
  'pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics',
  'spa.services.view','spa.services.manage',
  'spa.providers.view','spa.providers.manage',
  'spa.resources.view','spa.resources.manage',
  'spa.appointments.view','spa.appointments.create','spa.appointments.manage','spa.appointments.cancel',
  'spa.packages.view','spa.packages.manage',
  'spa.commissions.view','spa.commissions.manage',
  'spa.intake.view','spa.intake.manage','spa.clinical_notes.manage',
  'spa.settings.view','spa.settings.manage',
  'spa.reports.view','spa.reports.export',
  'spa.waitlist.view','spa.waitlist.manage',
  'spa.booking.manage','spa.operations.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: F&B Manager — same scope as Restaurant Floor Manager
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_FBM', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'catalog.view','catalog.manage',
  'orders.view','orders.create','orders.manage','orders.void',
  'returns.create','price.override','discounts.apply','charges.manage',
  'tenders.view','tenders.create','tenders.adjust','tenders.refund',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all','pos.register_tabs.transfer',
  'inventory.view','inventory.manage',
  'customers.view','customers.manage',
  'reports.view','reports.export',
  'room_layouts.view','room_layouts.manage',
  'pos_fnb.floor_plan.view','pos_fnb.floor_plan.manage',
  'pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.transfer',
  'pos_fnb.tabs.void','pos_fnb.tabs.manage','pos_fnb.tabs.manage_bulk_all_servers',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split','pos_fnb.payments.refund','pos_fnb.payments.void',
  'pos_fnb.tips.adjust','pos_fnb.tips.finalize','pos_fnb.tips.pool_manage','pos_fnb.tips.manage',
  'pos_fnb.menu.manage','pos_fnb.menu.comp','pos_fnb.menu.discount','pos_fnb.menu.price_override',
  'pos_fnb.close_batch.manage','pos_fnb.close_batch.cash_count',
  'pos_fnb.reports.view','pos_fnb.reports.export',
  'pos_fnb.settings.manage',
  'pos_fnb.gl.view','pos_fnb.gl.manage','pos_fnb.gl.post','pos_fnb.gl.reverse','pos_fnb.gl.mappings',
  'pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.host.view','pos_fnb.host.manage','pos_fnb.host.notifications','pos_fnb.host.analytics'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: Spa Manager — spa operations, commissions, reporting
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_SPM', unnest(ARRAY[
  'dashboard.view','dashboard.configure','settings.view','audit.view',
  'catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create',
  'shift.manage','cash.drawer',
  'customers.view','customers.manage',
  'reports.view','reports.export',
  'spa.services.view','spa.services.manage',
  'spa.providers.view','spa.providers.manage',
  'spa.resources.view','spa.resources.manage',
  'spa.appointments.view','spa.appointments.create','spa.appointments.manage','spa.appointments.cancel',
  'spa.packages.view','spa.packages.manage',
  'spa.commissions.view','spa.commissions.manage',
  'spa.intake.view','spa.intake.manage','spa.clinical_notes.manage',
  'spa.settings.view','spa.settings.manage',
  'spa.reports.view','spa.reports.export',
  'spa.waitlist.view','spa.waitlist.manage',
  'spa.booking.manage','spa.operations.manage'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: Cashier — multi-department register
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_CSH', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create','orders.manage',
  'tenders.view','tenders.create',
  'shift.manage','cash.drawer','cash.drop',
  'pos.register_tabs.view_all',
  'customers.view','discounts.apply',
  'room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'kds.view','kds.bump',
  'spa.appointments.view','spa.packages.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: Server — F&B table service
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_SRV', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','orders.create',
  'tenders.view','tenders.create','tenders.adjust',
  'cash.drawer','shift.manage',
  'customers.view','room_layouts.view',
  'pos_fnb.floor_plan.view','pos_fnb.tabs.view','pos_fnb.tabs.create','pos_fnb.tabs.manage',
  'pos_fnb.payments.create','pos_fnb.payments.split',
  'pos_fnb.tips.adjust','pos_fnb.menu.discount',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.host.view','pos_fnb.inventory.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: Chef — kitchen operations, KDS management, menu control, inventory
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_CHF', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'inventory.view','inventory.manage',
  'pos_fnb.kds.view','pos_fnb.kds.bump','pos_fnb.kds.recall','pos_fnb.kds.manage','pos_fnb.kds.settings.manage',
  'pos_fnb.menu.manage','pos_fnb.inventory.view','pos_fnb.inventory.manage',
  'pos_fnb.tabs.view','pos_fnb.reports.view',
  'kds.view','kds.bump','kds.recall','kds.manage','kds.settings.manage',
  'reports.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: Cook — KDS view/bump, catalog view (line cook / prep cook)
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_COK', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'pos_fnb.kds.view','pos_fnb.kds.bump',
  'pos_fnb.inventory.view','pos_fnb.tabs.view',
  'kds.view','kds.bump'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;

-- Hybrid: Staff — view-only across departments
INSERT INTO business_type_role_permissions (id, role_template_id, permission_key)
SELECT gen_ulid(), '01JQXBT000BTROLE_HYB_STF', unnest(ARRAY[
  'dashboard.view','catalog.view',
  'orders.view','customers.view',
  'inventory.view','room_layouts.view',
  'pos_fnb.host.view','pos_fnb.kds.view','pos_fnb.inventory.view',
  'kds.view',
  'spa.services.view','spa.appointments.view'
])
ON CONFLICT (role_template_id, permission_key) DO NOTHING;
