-- =============================================================================
-- Migration 0201: Performance Indexes
-- Addresses missing indexes found during full codebase performance audit.
-- All use IF NOT EXISTS for idempotency.
-- =============================================================================

-- ── Tenders ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenders_tenant_status
  ON tenders (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_tenders_tenant_business_date
  ON tenders (tenant_id, business_date);

CREATE INDEX IF NOT EXISTS idx_tenders_tenant_type_status_bdate
  ON tenders (tenant_id, tender_type, status, business_date);

CREATE INDEX IF NOT EXISTS idx_tenders_order_id
  ON tenders (order_id);

-- ── GL Journal Entries ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_tenant_period_status
  ON gl_journal_entries (tenant_id, posting_period, status);

CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_tenant_source
  ON gl_journal_entries (tenant_id, source_module, source_reference_id);

-- ── GL Journal Lines ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_account_id
  ON gl_journal_lines (account_id);

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_entry_id
  ON gl_journal_lines (journal_entry_id);

-- ── GL Unmapped Events ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gl_unmapped_events_tenant_unresolved
  ON gl_unmapped_events (tenant_id)
  WHERE resolved_at IS NULL;

-- ── Audit Log ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_action_created
  ON audit_log (tenant_id, action, created_at);

-- ── AP Bills ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ap_bills_tenant_status
  ON ap_bills (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_ap_bills_tenant_posted_at
  ON ap_bills (tenant_id, posted_at)
  WHERE status IN ('posted', 'partial', 'paid');

-- ── AP Payments ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ap_payments_tenant_status
  ON ap_payments (tenant_id, status);

-- ── AP Payment Allocations ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ap_payment_allocations_bill_id
  ON ap_payment_allocations (bill_id);

CREATE INDEX IF NOT EXISTS idx_ap_payment_allocations_payment_id
  ON ap_payment_allocations (payment_id);

-- ── AR Invoices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ar_invoices_tenant_status
  ON ar_invoices (tenant_id, status);

-- ── AR Receipts ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ar_receipts_tenant_status
  ON ar_receipts (tenant_id, status);

-- ── AR Receipt Allocations ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ar_receipt_allocations_invoice_id
  ON ar_receipt_allocations (invoice_id);

-- ── Orders ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_business_date
  ON orders (tenant_id, business_date);

-- ── Drawer Sessions ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drawer_sessions_tenant_location_status
  ON drawer_sessions (tenant_id, location_id, status);

CREATE INDEX IF NOT EXISTS idx_drawer_sessions_tenant_business_date
  ON drawer_sessions (tenant_id, business_date);

-- ── Drawer Session Events ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drawer_session_events_session_type
  ON drawer_session_events (drawer_session_id, event_type);

-- ── Deposit Slips ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deposit_slips_tenant_location_status
  ON deposit_slips (tenant_id, location_id, status);

-- ── Payment Settlements ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_settlements_tenant_status
  ON payment_settlements (tenant_id, status);

-- ── Sub Department GL Defaults ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sub_dept_gl_defaults_tenant
  ON sub_department_gl_defaults (tenant_id);

-- ── Tax Group GL Defaults ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tax_group_gl_defaults_tenant
  ON tax_group_gl_defaults (tenant_id);

-- ── Role Permissions (permission engine hot path) ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id
  ON role_permissions (role_id);

-- ── Reporting Read Models ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rm_daily_sales_tenant_date
  ON rm_daily_sales (tenant_id, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_rm_item_sales_tenant_date
  ON rm_item_sales (tenant_id, business_date DESC);

-- ── Event Dead Letters ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_dead_letters_status_failed
  ON event_dead_letters (status)
  WHERE status = 'failed';

-- ── Recurring Journal Templates ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant_active
  ON gl_recurring_templates (tenant_id)
  WHERE is_active = true;

-- ── Bank Accounts ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant_active
  ON bank_accounts (tenant_id)
  WHERE is_active = true;

-- ── Periodic COGS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_periodic_cogs_tenant_period
  ON periodic_cogs_calculations (tenant_id, period_start, period_end);

-- ── Accounting Close Periods ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_accounting_close_periods_tenant_period
  ON accounting_close_periods (tenant_id, posting_period);
