-- Migration: 0058_vendor_management
-- Additive columns + constraints for vendor management module.
-- vendors: name_normalized, website, default_payment_terms + UNIQUE + indexes
-- item_vendors: is_active, last_cost, last_received_at, min_order_qty, pack_size, notes + indexes
-- All changes are additive only — no drops, renames, or alterations to existing columns.

-- ═══════════════════════════════════════════════════════════════
-- VENDORS TABLE — additive columns
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add name_normalized as NULLABLE first (safe backfill)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS name_normalized TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS default_payment_terms TEXT;

-- Step 2: Backfill name_normalized for all existing rows
UPDATE vendors SET name_normalized = LOWER(TRIM(name)) WHERE name_normalized IS NULL;

-- Step 3: Make name_normalized NOT NULL (safe — all rows now populated)
ALTER TABLE vendors ALTER COLUMN name_normalized SET NOT NULL;

-- Step 4: UNIQUE constraint for duplicate name prevention (Rule VM-2)
-- Also serves as the lookup index for duplicate checks
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tenant_name_normalized
  ON vendors (tenant_id, name_normalized);

-- Step 5: Index for fast filtered list queries (active/inactive)
CREATE INDEX IF NOT EXISTS idx_vendors_tenant_active
  ON vendors (tenant_id, is_active);

-- ═══════════════════════════════════════════════════════════════
-- ITEM_VENDORS TABLE — additive columns
-- ═══════════════════════════════════════════════════════════════

-- Soft-delete flag (Rule VM-3) — default true so all existing rows stay active
ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Last cost tracking (Rule VM-4) — updated when receipts are posted
ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS last_cost NUMERIC(12,4);
ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ;

-- Additional catalog metadata
ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS min_order_qty NUMERIC(12,4);
ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS notes TEXT;

-- Backfill: seed last_cost from vendor_cost where available
UPDATE item_vendors SET last_cost = vendor_cost WHERE vendor_cost IS NOT NULL AND last_cost IS NULL;

-- Indexes for catalog queries
CREATE INDEX IF NOT EXISTS idx_item_vendors_tenant_vendor_active
  ON item_vendors (tenant_id, vendor_id, is_active);
CREATE INDEX IF NOT EXISTS idx_item_vendors_tenant_item_active
  ON item_vendors (tenant_id, inventory_item_id, is_active);
