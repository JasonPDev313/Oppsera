-- Add missing FK indexes flagged by Supabase linter
-- Only includes FKs that genuinely lack a covering index.
-- Most other flagged FKs already have composite (tenant_id, fk_col) indexes.

-- catalog_items.tax_category_id — used in POS tax resolution JOINs
CREATE INDEX IF NOT EXISTS idx_catalog_items_tax_category
  ON catalog_items (tenant_id, tax_category_id)
  WHERE tax_category_id IS NOT NULL;

-- ap_bills.payment_terms_id — used in bill list with terms display
CREATE INDEX IF NOT EXISTS idx_ap_bills_payment_terms
  ON ap_bills (tenant_id, payment_terms_id)
  WHERE payment_terms_id IS NOT NULL;

-- customer_auth_accounts.customer_id — has unique constraint but no query-friendly index
-- The unique index includes provider as 3rd column which doesn't help plain customer lookups
CREATE INDEX IF NOT EXISTS idx_customer_auth_accounts_tenant_customer
  ON customer_auth_accounts (tenant_id, customer_id);
