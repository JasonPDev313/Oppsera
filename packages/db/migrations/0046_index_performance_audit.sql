-- ============================================================================
-- Migration: 0046_index_performance_audit.sql
-- Purpose:   Fix cross-tenant indexes, drop redundant indexes
-- Date:      2026-02-17
--
-- SECTION 1: Cross-tenant index fixes (CRITICAL — security + RLS performance)
-- SECTION 2: Redundant index cleanup (STRUCTURALLY REDUNDANT — B-tree prefix)
-- ============================================================================

-- ── SECTION 1: Cross-Tenant Index Fixes ─────────────────────────────────────
-- These indexes lack a tenant_id prefix, meaning:
--   (a) RLS policies cannot use them for tenant-scoped scans
--   (b) Queries may scan rows from other tenants before RLS filters them
-- Fix: DROP the old index, CREATE a replacement with tenant_id as leading column.

-- 1a. order_charges: (order_id) → (tenant_id, order_id)
DROP INDEX IF EXISTS idx_order_charges_order;
CREATE INDEX IF NOT EXISTS idx_order_charges_tenant_order
  ON order_charges (tenant_id, order_id);

-- 1b. order_discounts: (order_id) → (tenant_id, order_id)
DROP INDEX IF EXISTS idx_order_discounts_order;
CREATE INDEX IF NOT EXISTS idx_order_discounts_tenant_order
  ON order_discounts (tenant_id, order_id);

-- 1c. order_lines: (order_id, sort_order) → (tenant_id, order_id, sort_order)
DROP INDEX IF EXISTS idx_order_lines_order_sort;
CREATE INDEX IF NOT EXISTS idx_order_lines_tenant_order_sort
  ON order_lines (tenant_id, order_id, sort_order);

-- 1d. catalog_modifiers: (modifier_group_id) → (tenant_id, modifier_group_id)
DROP INDEX IF EXISTS idx_catalog_modifiers_group;
CREATE INDEX IF NOT EXISTS idx_catalog_modifiers_tenant_group
  ON catalog_modifiers (tenant_id, modifier_group_id);

-- 1e. payment_journal_entries: (reference_type, reference_id) → (tenant_id, reference_type, reference_id)
DROP INDEX IF EXISTS idx_pje_ref;
CREATE INDEX IF NOT EXISTS idx_pje_tenant_ref
  ON payment_journal_entries (tenant_id, reference_type, reference_id);

-- 1f. ar_transactions: (reference_type, reference_id) → (tenant_id, reference_type, reference_id)
DROP INDEX IF EXISTS idx_ar_transactions_reference;
CREATE INDEX IF NOT EXISTS idx_ar_transactions_tenant_reference
  ON ar_transactions (tenant_id, reference_type, reference_id);


-- ── SECTION 2: Redundant Index Cleanup ──────────────────────────────────────
-- All [STRUCTURALLY REDUNDANT]: each is a strict left-prefix of a wider index
-- on the same table. B-tree left-prefix rule guarantees the wider index serves
-- all queries the narrower index would, with zero performance difference.

-- 2a. idx_tax_categories_tenant(tenant_id)
--     subsumed by uq_tax_categories_tenant_name(tenant_id, name)
DROP INDEX IF EXISTS idx_tax_categories_tenant;

-- 2b. idx_catalog_categories_tenant(tenant_id)
--     subsumed by idx_catalog_categories_parent(tenant_id, parent_id)
DROP INDEX IF EXISTS idx_catalog_categories_tenant;

-- 2c. idx_memberships_tenant(tenant_id)
--     subsumed by uq_memberships_tenant_user(tenant_id, user_id)
DROP INDEX IF EXISTS idx_memberships_tenant;

-- 2d. idx_entitlements_tenant(tenant_id)
--     subsumed by uq_entitlements_tenant_module(tenant_id, module_key)
DROP INDEX IF EXISTS idx_entitlements_tenant;
