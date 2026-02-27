-- Migration 0212: Discount GL Classification
-- Adds per-classification GL account mapping for all discount types,
-- enabling granular financial tracking of discounts and comps.

-- ── 1. Add discount_classification to order_discounts ──────────────
ALTER TABLE order_discounts
  ADD COLUMN IF NOT EXISTS discount_classification TEXT;

CREATE INDEX IF NOT EXISTS idx_order_discounts_tenant_classification
  ON order_discounts (tenant_id, discount_classification)
  WHERE discount_classification IS NOT NULL;

-- ── 2. Add price_override_discount_cents to order_lines ────────────
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS price_override_discount_cents INTEGER NOT NULL DEFAULT 0;

-- ── 3. Create discount_gl_mappings table ───────────────────────────
CREATE TABLE IF NOT EXISTS discount_gl_mappings (
  tenant_id TEXT NOT NULL,
  sub_department_id TEXT NOT NULL,
  discount_classification TEXT NOT NULL,
  gl_account_id TEXT REFERENCES gl_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sub_department_id, discount_classification)
);

CREATE INDEX IF NOT EXISTS idx_discount_gl_mappings_tenant
  ON discount_gl_mappings (tenant_id);

-- ── 4. Add default discount accounts to accounting_settings ────────
ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_discount_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_price_override_expense_account_id TEXT;

-- ── 5. Add discount_classification to gl_journal_lines ─────────────
ALTER TABLE gl_journal_lines
  ADD COLUMN IF NOT EXISTS discount_classification TEXT;

-- ── 6. RLS on discount_gl_mappings ─────────────────────────────────
ALTER TABLE discount_gl_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_gl_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_gl_mappings_select ON discount_gl_mappings;
CREATE POLICY discount_gl_mappings_select ON discount_gl_mappings
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS discount_gl_mappings_insert ON discount_gl_mappings;
CREATE POLICY discount_gl_mappings_insert ON discount_gl_mappings
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS discount_gl_mappings_update ON discount_gl_mappings;
CREATE POLICY discount_gl_mappings_update ON discount_gl_mappings
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS discount_gl_mappings_delete ON discount_gl_mappings;
CREATE POLICY discount_gl_mappings_delete ON discount_gl_mappings
  FOR DELETE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

-- ── 7. Seed GL account templates (all 4 business types) ────────────
-- Contra-revenue discount accounts (4100–4105)
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT gen_random_uuid()::text, btype, acct_num, acct_name, acct_type, normal_bal, class_name, false, sorder
FROM (VALUES
  ('4100', 'Sales Discounts - Manual',    'revenue', 'debit', 'Contra Revenue', 4100),
  ('4101', 'Promotional Discounts',       'revenue', 'debit', 'Contra Revenue', 4101),
  ('4102', 'Employee Discounts',          'revenue', 'debit', 'Contra Revenue', 4102),
  ('4103', 'Loyalty Program Discounts',   'revenue', 'debit', 'Contra Revenue', 4103),
  ('4104', 'Member Discounts',            'revenue', 'debit', 'Contra Revenue', 4104),
  ('4105', 'Price Match Adjustments',     'revenue', 'debit', 'Contra Revenue', 4105)
) AS accts(acct_num, acct_name, acct_type, normal_bal, class_name, sorder)
CROSS JOIN (VALUES ('golf_default'), ('retail_default'), ('restaurant_default'), ('hybrid_default')) AS bt(btype)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates t2
  WHERE t2.template_key = bt.btype AND t2.account_number = accts.acct_num
);

-- Expense comp accounts (6150–6154)
INSERT INTO gl_account_templates (id, template_key, account_number, name, account_type, normal_balance, classification_name, is_control_account, sort_order)
SELECT gen_random_uuid()::text, btype, acct_num, acct_name, acct_type, normal_bal, class_name, false, sorder
FROM (VALUES
  ('6150', 'Manager Comps',              'expense', 'debit', 'Operating Expenses', 6150),
  ('6151', 'Promotional Comps',          'expense', 'debit', 'Operating Expenses', 6151),
  ('6152', 'Quality Recovery Expense',   'expense', 'debit', 'Operating Expenses', 6152),
  ('6153', 'Price Override Loss',        'expense', 'debit', 'Operating Expenses', 6153),
  ('6154', 'Other Comps & Write-offs',   'expense', 'debit', 'Operating Expenses', 6154)
) AS accts(acct_num, acct_name, acct_type, normal_bal, class_name, sorder)
CROSS JOIN (VALUES ('golf_default'), ('retail_default'), ('restaurant_default'), ('hybrid_default')) AS bt(btype)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_templates t2
  WHERE t2.template_key = bt.btype AND t2.account_number = accts.acct_num
);

-- ── 8. Seed system transaction types for granular discounts ────────
-- Replace generic 'discount' and 'comp' with 11 granular types
INSERT INTO gl_transaction_types (id, tenant_id, code, name, category, description, default_debit_account_type, default_credit_account_type, sort_order, is_active)
SELECT gen_random_uuid()::text, NULL, code, name, category, description, debit_acct_type, credit_acct_type, sort_order, true
FROM (VALUES
  ('manual_discount',   'Sales Discounts - Manual',    'discount', 'Cashier-applied percentage or dollar off',                  'revenue', NULL, 700),
  ('promo_code',        'Promotional Discounts',       'discount', 'Promo code or coupon redemptions',                          'revenue', NULL, 701),
  ('employee_discount', 'Employee Discounts',          'discount', 'Staff meal or merchandise discounts',                       'revenue', NULL, 702),
  ('loyalty_discount',  'Loyalty Program Discounts',   'discount', 'Points redemption or member pricing',                       'revenue', NULL, 703),
  ('member_discount',   'Member Discounts',            'discount', 'Membership-based pricing (golf/club member rates)',         'revenue', NULL, 704),
  ('price_match',       'Price Match Adjustments',     'discount', 'Competitor price matching',                                 'revenue', NULL, 705),
  ('manager_comp',      'Manager Comps',               'comp',     'Manager-authorized giveaways',                              'expense', NULL, 710),
  ('promo_comp',        'Promotional Comps',           'comp',     'Marketing or promotion giveaways',                          'expense', NULL, 711),
  ('quality_recovery',  'Quality Recovery Expense',    'comp',     'Food or service quality issue comps',                       'expense', NULL, 712),
  ('price_override',    'Price Override Loss',         'comp',     'Revenue loss from manual price reductions',                 'expense', NULL, 713),
  ('other_comp',        'Other Comps & Write-offs',    'comp',     'Catch-all comp expense',                                    'expense', NULL, 714)
) AS types(code, name, category, description, debit_acct_type, credit_acct_type, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM gl_transaction_types t2
  WHERE t2.code = types.code AND t2.tenant_id IS NULL
);

-- ── 9. Reporting read model for discount analysis ──────────────────
CREATE TABLE IF NOT EXISTS rm_discount_analysis (
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  discount_classification TEXT NOT NULL,
  sub_department_id TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  avg_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_discount_analysis_key
  ON rm_discount_analysis (tenant_id, location_id, business_date, discount_classification, COALESCE(sub_department_id, '__none__'));

ALTER TABLE rm_discount_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_discount_analysis FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_discount_analysis_select ON rm_discount_analysis;
CREATE POLICY rm_discount_analysis_select ON rm_discount_analysis
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS rm_discount_analysis_insert ON rm_discount_analysis;
CREATE POLICY rm_discount_analysis_insert ON rm_discount_analysis
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

DROP POLICY IF EXISTS rm_discount_analysis_update ON rm_discount_analysis;
CREATE POLICY rm_discount_analysis_update ON rm_discount_analysis
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );
