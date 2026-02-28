-- Drop cross-module FK constraints that reference gl_accounts.id
-- from non-accounting schema tables. This enables independent
-- schema deployment and future microservice extraction.
-- The columns remain — only the FK enforcement is removed.
-- Application-layer validation continues to ensure referential integrity.

-- ── AP module ────────────────────────────────────────────────────
ALTER TABLE ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_account_id_gl_accounts_id_fk;

-- ── Budgets ──────────────────────────────────────────────────────
ALTER TABLE budget_lines
  DROP CONSTRAINT IF EXISTS budget_lines_gl_account_id_gl_accounts_id_fk;

-- ── Project Costing ──────────────────────────────────────────────
ALTER TABLE project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_gl_expense_account_id_gl_accounts_id_fk;

-- ── Intercompany ─────────────────────────────────────────────────
ALTER TABLE intercompany_gl_account_pairs
  DROP CONSTRAINT IF EXISTS intercompany_gl_account_pairs_ar_account_id_gl_accounts_id_fk;

ALTER TABLE intercompany_gl_account_pairs
  DROP CONSTRAINT IF EXISTS intercompany_gl_account_pairs_ap_account_id_gl_accounts_id_fk;

ALTER TABLE intercompany_gl_account_pairs
  DROP CONSTRAINT IF EXISTS intercompany_gl_account_pairs_revenue_elimination_account_id_gl_accounts_id_fk;

ALTER TABLE intercompany_gl_account_pairs
  DROP CONSTRAINT IF EXISTS intercompany_gl_account_pairs_expense_elimination_account_id_gl_accounts_id_fk;

-- ── Transaction Types (tender + mapping tables) ──────────────────
ALTER TABLE tenant_tender_types
  DROP CONSTRAINT IF EXISTS tenant_tender_types_default_clearing_account_id_gl_accounts_id_fk;

ALTER TABLE tenant_tender_types
  DROP CONSTRAINT IF EXISTS tenant_tender_types_default_bank_account_id_gl_accounts_id_fk;

ALTER TABLE tenant_tender_types
  DROP CONSTRAINT IF EXISTS tenant_tender_types_default_fee_account_id_gl_accounts_id_fk;

ALTER TABLE tenant_tender_types
  DROP CONSTRAINT IF EXISTS tenant_tender_types_default_expense_account_id_gl_accounts_id_fk;

ALTER TABLE gl_transaction_type_mappings
  DROP CONSTRAINT IF EXISTS gl_transaction_type_mappings_credit_account_id_gl_accounts_id_fk;

ALTER TABLE gl_transaction_type_mappings
  DROP CONSTRAINT IF EXISTS gl_transaction_type_mappings_debit_account_id_gl_accounts_id_fk;
