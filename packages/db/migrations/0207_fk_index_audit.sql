-- =============================================================================
-- Migration 0207: FK Index Audit
-- Adds indexes on foreign key columns that lack them in GL and PMS tables.
-- All use IF NOT EXISTS for idempotency.
-- =============================================================================

-- ── GL: Accounts ───────────────────────────────────────────────────────────
-- classification_id is used in JOINs for COA listing and filtering
CREATE INDEX IF NOT EXISTS idx_gl_accounts_classification
  ON gl_accounts (tenant_id, classification_id)
  WHERE classification_id IS NOT NULL;

-- parent_account_id is used for hierarchy traversal (tree views)
CREATE INDEX IF NOT EXISTS idx_gl_accounts_parent
  ON gl_accounts (tenant_id, parent_account_id)
  WHERE parent_account_id IS NOT NULL;

-- ── GL: Journal Line Dimensions ────────────────────────────────────────────
-- Dimension columns added in migration 0101, used in GL reporting filters
-- (account_id and journal_entry_id already indexed in migration 0201)
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_location
  ON gl_journal_lines (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_profit_center
  ON gl_journal_lines (profit_center_id)
  WHERE profit_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_sub_department
  ON gl_journal_lines (sub_department_id)
  WHERE sub_department_id IS NOT NULL;

-- ── GL: Bank Reconciliation ────────────────────────────────────────────────
-- Items looked up by reconciliation_id (parent FK) for the reconciliation workspace
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_items_recon
  ON bank_reconciliation_items (reconciliation_id);

-- ── PMS: Payment Transactions ──────────────────────────────────────────────
-- Folio transaction history (hot path for folio detail view)
CREATE INDEX IF NOT EXISTS idx_pms_payment_transactions_folio
  ON pms_payment_transactions (folio_id);

-- Reservation payment lookups
CREATE INDEX IF NOT EXISTS idx_pms_payment_transactions_reservation
  ON pms_payment_transactions (reservation_id)
  WHERE reservation_id IS NOT NULL;

-- ── PMS: Groups & Corporate ────────────────────────────────────────────────
-- Group→Corporate account navigation
CREATE INDEX IF NOT EXISTS idx_pms_groups_corporate_account
  ON pms_groups (tenant_id, corporate_account_id)
  WHERE corporate_account_id IS NOT NULL;

-- Room block queries by room type
CREATE INDEX IF NOT EXISTS idx_pms_group_room_blocks_room_type
  ON pms_group_room_blocks (room_type_id);

-- Corporate rate overrides by room type
CREATE INDEX IF NOT EXISTS idx_pms_corporate_rate_overrides_room_type
  ON pms_corporate_rate_overrides (room_type_id);

-- ── PMS: Rate Restrictions ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pms_rate_restrictions_room_type
  ON pms_rate_restrictions (room_type_id)
  WHERE room_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pms_rate_restrictions_rate_plan
  ON pms_rate_restrictions (rate_plan_id)
  WHERE rate_plan_id IS NOT NULL;

-- ── PMS: Channel Sync Log ──────────────────────────────────────────────────
-- Sync history per channel
CREATE INDEX IF NOT EXISTS idx_pms_channel_sync_log_channel
  ON pms_channel_sync_log (channel_id);

-- ── PMS: Work Orders ───────────────────────────────────────────────────────
-- Comment thread loading for work order detail view
CREATE INDEX IF NOT EXISTS idx_pms_work_order_comments_work_order
  ON pms_work_order_comments (work_order_id);

-- ── PMS: Loyalty ───────────────────────────────────────────────────────────
-- Program membership lookups
CREATE INDEX IF NOT EXISTS idx_pms_loyalty_members_program
  ON pms_loyalty_members (program_id);

-- Member transaction history
CREATE INDEX IF NOT EXISTS idx_pms_loyalty_transactions_member
  ON pms_loyalty_transactions (member_id);
