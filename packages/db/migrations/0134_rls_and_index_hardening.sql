-- Migration 0134: RLS + Index Hardening
-- Fixes: ar_invoice_lines missing tenant_id + RLS, payment_journal_entries missing RLS,
-- and 9 missing database indexes identified in code audit.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Add tenant_id to ar_invoice_lines (currently missing — needed for RLS)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE ar_invoice_lines
  ADD COLUMN IF NOT EXISTS tenant_id TEXT
    REFERENCES tenants(id);

-- Backfill tenant_id from parent ar_invoices
UPDATE ar_invoice_lines l
SET tenant_id = i.tenant_id
FROM ar_invoices i
WHERE l.invoice_id = i.id
  AND l.tenant_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE ar_invoice_lines
  ALTER COLUMN tenant_id SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Enable RLS on ar_invoice_lines
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE ar_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_invoice_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY ar_invoice_lines_select ON ar_invoice_lines
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY ar_invoice_lines_insert ON ar_invoice_lines
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY ar_invoice_lines_update ON ar_invoice_lines
  FOR UPDATE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY ar_invoice_lines_delete ON ar_invoice_lines
  FOR DELETE USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

-- ═══════════════════════════════════════════════════════════════════
-- 3. Enable RLS on payment_journal_entries
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE payment_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_journal_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY pje_select ON payment_journal_entries
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

CREATE POLICY pje_insert ON payment_journal_entries
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('app.current_tenant_id', true))
  );

-- payment_journal_entries is append-only: no UPDATE or DELETE policies

-- ═══════════════════════════════════════════════════════════════════
-- 4. Missing database indexes
-- ═══════════════════════════════════════════════════════════════════

-- 4a. catalog_items.tax_category_id (FK without index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_catalog_items_tax_category
  ON catalog_items (tax_category_id);

-- 4b. ap_bill_lines composite index for bill lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_bill_lines_bill
  ON ap_bill_lines (bill_id);

-- 4c. ap_bills.payment_terms_id (FK without index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_bills_payment_terms
  ON ap_bills (payment_terms_id);

-- 4d. ar_invoice_lines.account_id (FK for GL account joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ar_invoice_lines_account
  ON ar_invoice_lines (account_id);

-- 4e. ar_invoice_lines.tenant_id (for RLS + query performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ar_invoice_lines_tenant
  ON ar_invoice_lines (tenant_id);

-- 4f. item_uom_conversions FK indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_uom_conversions_item
  ON item_uom_conversions (inventory_item_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_uom_conversions_uom
  ON item_uom_conversions (uom_id);

-- 4g. item_vendors composite index for vendor catalog lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_vendors_vendor
  ON item_vendors (vendor_id);

-- 4h. purchase_order_lines FK index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_order_lines_po
  ON purchase_order_lines (purchase_order_id);

-- 4i. customer_relationships FK indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_relationships_related
  ON customer_relationships (related_customer_id);

-- 4j. chargebacks FK index (tender_id already indexed; add provider case)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chargebacks_provider_case
  ON chargebacks (provider_case_id)
  WHERE provider_case_id IS NOT NULL;
