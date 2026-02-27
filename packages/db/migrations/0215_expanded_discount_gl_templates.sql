-- Migration 0215: Expanded discount GL templates (11 → 24 classifications)
-- Adds 9 new contra-revenue accounts (4106–4114) and 4 new expense accounts (6155–6158)
-- across all 4 business types. Also seeds matching gl_transaction_types.
-- Idempotent: uses WHERE NOT EXISTS guards.

-- ── 1. New contra-revenue discount accounts (4106–4114) ─────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT gen_random_uuid()::text, btype, acct_num, acct_name, acct_type, normal_bal, class_name, false, sorder
FROM (VALUES
  ('4106', 'Volume / Quantity Discounts',    'revenue', 'debit', 'Contra Revenue', 4106),
  ('4107', 'Senior / Military Discounts',    'revenue', 'debit', 'Contra Revenue', 4107),
  ('4108', 'Group / Event Discounts',        'revenue', 'debit', 'Contra Revenue', 4108),
  ('4109', 'Seasonal / Clearance Markdowns', 'revenue', 'debit', 'Contra Revenue', 4109),
  ('4110', 'Vendor-Funded Promotions',       'revenue', 'debit', 'Contra Revenue', 4110),
  ('4111', 'Rain Check Credits',             'revenue', 'debit', 'Contra Revenue', 4111),
  ('4112', 'Cash / Early Payment Discounts', 'revenue', 'debit', 'Contra Revenue', 4112),
  ('4113', 'Bundle / Package Discounts',     'revenue', 'debit', 'Contra Revenue', 4113),
  ('4114', 'Trade Discounts',                'revenue', 'debit', 'Contra Revenue', 4114)
) AS accts(acct_num, acct_name, acct_type, normal_bal, class_name, sorder)
CROSS JOIN (VALUES ('golf_default'), ('retail_default'), ('restaurant_default'), ('hybrid_default')) AS bt(btype)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates t2
  WHERE t2.template_key = bt.btype AND t2.account_number = accts.acct_num
);

-- ── 2. New expense comp/write-off accounts (6155–6158) ──────────────
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT gen_random_uuid()::text, btype, acct_num, acct_name, acct_type, normal_bal, class_name, false, sorder
FROM (VALUES
  ('6155', 'Spoilage & Waste Write-offs',      'expense', 'debit', 'Operating Expenses', 6155),
  ('6156', 'Charity / Donation Comps',         'expense', 'debit', 'Operating Expenses', 6156),
  ('6157', 'Training & Staff Meals',           'expense', 'debit', 'Operating Expenses', 6157),
  ('6158', 'Insurance Recovery Write-offs',    'expense', 'debit', 'Operating Expenses', 6158)
) AS accts(acct_num, acct_name, acct_type, normal_bal, class_name, sorder)
CROSS JOIN (VALUES ('golf_default'), ('retail_default'), ('restaurant_default'), ('hybrid_default')) AS bt(btype)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates t2
  WHERE t2.template_key = bt.btype AND t2.account_number = accts.acct_num
);

-- ── 3. Seed system transaction types for new discount classifications ──
INSERT INTO gl_transaction_types (id, tenant_id, code, name, category, description, default_debit_account_type, default_credit_account_type, sort_order, is_active)
SELECT gen_random_uuid()::text, NULL, code, name, category, description, debit_acct_type, credit_acct_type, sort_order, true
FROM (VALUES
  -- Contra-revenue
  ('volume_discount',     'Volume / Quantity Discounts',    'discount', 'Quantity-based tiered pricing (buy X get Y)',                    'revenue', NULL, 706),
  ('senior_military',     'Senior / Military Discounts',    'discount', 'Senior citizen, veteran, or active military discounts',          'revenue', NULL, 707),
  ('group_event',         'Group / Event Discounts',        'discount', 'Group rate or event-based pricing (tournaments, banquets)',      'revenue', NULL, 708),
  ('seasonal_clearance',  'Seasonal / Clearance Markdowns', 'discount', 'End-of-season markdowns and clearance pricing',                 'revenue', NULL, 709),
  ('vendor_funded',       'Vendor-Funded Promotions',       'discount', 'Vendor-funded co-op discounts or trade promotions',             'revenue', NULL, 716),
  ('rain_check',          'Rain Check Credits',             'discount', 'Rain check voucher redemptions (golf/outdoor)',                  'revenue', NULL, 717),
  ('early_payment',       'Cash / Early Payment Discounts', 'discount', 'Cash payment or early settlement discounts',                    'revenue', NULL, 718),
  ('bundle_package',      'Bundle / Package Discounts',     'discount', 'Multi-item bundle or package pricing reductions',               'revenue', NULL, 719),
  ('trade_discount',      'Trade Discounts',                'discount', 'B2B wholesale or trade pricing adjustments',                    'revenue', NULL, 720),
  -- Expense
  ('spoilage_waste',      'Spoilage & Waste Write-offs',      'comp', 'Food spoilage, breakage, or waste write-offs',                    'expense', NULL, 715),
  ('charity_donation',    'Charity / Donation Comps',         'comp', 'Charitable donations and community sponsorship comps',            'expense', NULL, 721),
  ('training_staff_meal', 'Training & Staff Meals',           'comp', 'Training comp meals and authorized staff meals',                  'expense', NULL, 722),
  ('insurance_recovery',  'Insurance Recovery Write-offs',    'comp', 'Insurance claim write-offs and recovery adjustments',             'expense', NULL, 723)
) AS types(code, name, category, description, debit_acct_type, credit_acct_type, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_transaction_types t2
  WHERE t2.tenant_id IS NULL AND t2.code = types.code
);
