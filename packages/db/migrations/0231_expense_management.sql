-- ============================================================================
-- 0231 — Expense Management
-- Tables: expense_policies, expenses, expense_receipts, rm_expense_summary
-- Extends: accounting_settings (reimbursable + petty cash GL account defaults)
-- ============================================================================

-- ── expense_policies ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expense_policies (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  description   TEXT,

  auto_approve_threshold    NUMERIC(12,2),
  requires_receipt_above    NUMERIC(12,2),
  max_amount_per_expense    NUMERIC(12,2),
  allowed_categories        TEXT[],
  approver_role             TEXT DEFAULT 'manager',

  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_policies_tenant_name
  ON expense_policies (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_expense_policies_tenant
  ON expense_policies (tenant_id);

-- RLS
ALTER TABLE expense_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_policies FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_policies_select' AND tablename = 'expense_policies') THEN
    CREATE POLICY expense_policies_select ON expense_policies FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_policies_insert' AND tablename = 'expense_policies') THEN
    CREATE POLICY expense_policies_insert ON expense_policies FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_policies_update' AND tablename = 'expense_policies') THEN
    CREATE POLICY expense_policies_update ON expense_policies FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_policies_delete' AND tablename = 'expense_policies') THEN
    CREATE POLICY expense_policies_delete ON expense_policies FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── expenses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  location_id       TEXT,

  expense_number    TEXT NOT NULL,
  employee_user_id  TEXT NOT NULL,
  expense_policy_id TEXT REFERENCES expense_policies(id),

  status            TEXT NOT NULL DEFAULT 'draft',
  expense_date      DATE NOT NULL,
  vendor_name       TEXT,
  category          TEXT NOT NULL,
  description       TEXT,
  amount            NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',

  payment_method    TEXT,
  is_reimbursable   BOOLEAN NOT NULL DEFAULT TRUE,

  receipt_url       TEXT,
  receipt_file_name TEXT,

  gl_account_id     TEXT,
  project_id        TEXT,
  gl_journal_entry_id TEXT,

  submitted_at      TIMESTAMPTZ,
  submitted_by      TEXT,
  approved_at       TIMESTAMPTZ,
  approved_by       TEXT,
  rejected_at       TIMESTAMPTZ,
  rejected_by       TEXT,
  rejection_reason  TEXT,
  posted_at         TIMESTAMPTZ,
  posted_by         TEXT,
  voided_at         TIMESTAMPTZ,
  voided_by         TEXT,
  void_reason       TEXT,
  reimbursed_at     TIMESTAMPTZ,
  reimbursement_method TEXT,
  reimbursement_reference TEXT,

  notes             TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  client_request_id TEXT,
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_tenant_number
  ON expenses (tenant_id, expense_number);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_status
  ON expenses (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_employee
  ON expenses (tenant_id, employee_user_id);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date
  ON expenses (tenant_id, expense_date);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_category
  ON expenses (tenant_id, category);

-- RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expenses_select' AND tablename = 'expenses') THEN
    CREATE POLICY expenses_select ON expenses FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expenses_insert' AND tablename = 'expenses') THEN
    CREATE POLICY expenses_insert ON expenses FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expenses_update' AND tablename = 'expenses') THEN
    CREATE POLICY expenses_update ON expenses FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expenses_delete' AND tablename = 'expenses') THEN
    CREATE POLICY expenses_delete ON expenses FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── expense_receipts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expense_receipts (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  expense_id    TEXT NOT NULL REFERENCES expenses(id),

  file_name     TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER,
  storage_key   TEXT NOT NULL,

  uploaded_by   TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense
  ON expense_receipts (expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_tenant
  ON expense_receipts (tenant_id);

-- RLS
ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_receipts FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_receipts_select' AND tablename = 'expense_receipts') THEN
    CREATE POLICY expense_receipts_select ON expense_receipts FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_receipts_insert' AND tablename = 'expense_receipts') THEN
    CREATE POLICY expense_receipts_insert ON expense_receipts FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_receipts_update' AND tablename = 'expense_receipts') THEN
    CREATE POLICY expense_receipts_update ON expense_receipts FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_receipts_delete' AND tablename = 'expense_receipts') THEN
    CREATE POLICY expense_receipts_delete ON expense_receipts FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── rm_expense_summary (CQRS read model) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS rm_expense_summary (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  location_id     TEXT,
  fiscal_period   TEXT NOT NULL,
  category        TEXT NOT NULL,

  expense_count      INTEGER NOT NULL DEFAULT 0,
  total_amount       NUMERIC(19,4) NOT NULL DEFAULT 0,
  reimbursed_count   INTEGER NOT NULL DEFAULT 0,
  reimbursed_amount  NUMERIC(19,4) NOT NULL DEFAULT 0,
  pending_count      INTEGER NOT NULL DEFAULT 0,
  pending_amount     NUMERIC(19,4) NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rm_expense_summary
  ON rm_expense_summary (tenant_id, COALESCE(location_id, ''), fiscal_period, category);

CREATE INDEX IF NOT EXISTS idx_rm_expense_summary_tenant
  ON rm_expense_summary (tenant_id);

-- RLS
ALTER TABLE rm_expense_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_expense_summary FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_expense_summary_select' AND tablename = 'rm_expense_summary') THEN
    CREATE POLICY rm_expense_summary_select ON rm_expense_summary FOR SELECT
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_expense_summary_insert' AND tablename = 'rm_expense_summary') THEN
    CREATE POLICY rm_expense_summary_insert ON rm_expense_summary FOR INSERT
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_expense_summary_update' AND tablename = 'rm_expense_summary') THEN
    CREATE POLICY rm_expense_summary_update ON rm_expense_summary FOR UPDATE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rm_expense_summary_delete' AND tablename = 'rm_expense_summary') THEN
    CREATE POLICY rm_expense_summary_delete ON rm_expense_summary FOR DELETE
      USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
  END IF;
END $$;

-- ── Accounting settings extensions ──────────────────────────────────────────

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS default_employee_reimbursable_account_id TEXT,
  ADD COLUMN IF NOT EXISTS default_petty_cash_account_id TEXT;

-- ── Seed expense-related GL account templates ───────────────────────────────

INSERT INTO gl_account_templates (id, business_type, account_number, name, account_type, normal_balance, classification_code, is_system, sort_order)
VALUES
  -- Employee Reimbursable Payable
  (gen_random_uuid()::text, 'golf',       '2310', 'Employee Reimbursable Payable', 'liability', 'credit', 'CL', TRUE, 2310),
  (gen_random_uuid()::text, 'retail',     '2310', 'Employee Reimbursable Payable', 'liability', 'credit', 'CL', TRUE, 2310),
  (gen_random_uuid()::text, 'restaurant', '2310', 'Employee Reimbursable Payable', 'liability', 'credit', 'CL', TRUE, 2310),
  (gen_random_uuid()::text, 'hybrid',     '2310', 'Employee Reimbursable Payable', 'liability', 'credit', 'CL', TRUE, 2310),
  -- Employee Expense
  (gen_random_uuid()::text, 'golf',       '6200', 'Employee Expense', 'expense', 'debit', 'OE', TRUE, 6200),
  (gen_random_uuid()::text, 'retail',     '6200', 'Employee Expense', 'expense', 'debit', 'OE', TRUE, 6200),
  (gen_random_uuid()::text, 'restaurant', '6200', 'Employee Expense', 'expense', 'debit', 'OE', TRUE, 6200),
  (gen_random_uuid()::text, 'hybrid',     '6200', 'Employee Expense', 'expense', 'debit', 'OE', TRUE, 6200),
  -- Petty Cash
  (gen_random_uuid()::text, 'golf',       '1120', 'Petty Cash', 'asset', 'debit', 'CA', TRUE, 1120),
  (gen_random_uuid()::text, 'retail',     '1120', 'Petty Cash', 'asset', 'debit', 'CA', TRUE, 1120),
  (gen_random_uuid()::text, 'restaurant', '1120', 'Petty Cash', 'asset', 'debit', 'CA', TRUE, 1120),
  (gen_random_uuid()::text, 'hybrid',     '1120', 'Petty Cash', 'asset', 'debit', 'CA', TRUE, 1120)
ON CONFLICT DO NOTHING;
