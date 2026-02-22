-- Session 46: Membership GL + AR Billing
-- Adds GL account references to membership plans for deferred revenue recognition.
-- Adds billingAccountId to orders to enable house-account flow.

-- 1. Membership GL accounts
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS revenue_gl_account_id TEXT;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS deferred_revenue_gl_account_id TEXT;

-- 2. Orders billing account
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_billing_account
  ON orders(tenant_id, billing_account_id)
  WHERE billing_account_id IS NOT NULL;
