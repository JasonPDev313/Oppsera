-- Folio enhancements: notes, void tracking, routing rules, label column
-- Supports: void/correction workflow, folio notes, routing rules, multi-folio labels

-- 1. Folio notes
ALTER TABLE pms_folios ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Folio label (e.g., "Guest", "Company", "Group Master")
ALTER TABLE pms_folios ADD COLUMN IF NOT EXISTS label TEXT;

-- 3. Void tracking on entries
ALTER TABLE pms_folio_entries ADD COLUMN IF NOT EXISTS voided_entry_id TEXT;
ALTER TABLE pms_folio_entries ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE pms_folio_entries ADD COLUMN IF NOT EXISTS voided_by TEXT;

-- Index for looking up void reversals
CREATE INDEX IF NOT EXISTS idx_pms_folio_entries_voided
  ON pms_folio_entries (voided_entry_id)
  WHERE voided_entry_id IS NOT NULL;

-- 4. Folio routing rules table
CREATE TABLE IF NOT EXISTS pms_folio_routing_rules (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  property_id TEXT NOT NULL REFERENCES pms_properties(id),
  entry_type TEXT NOT NULL,
  department_code TEXT,
  target_folio_label TEXT NOT NULL DEFAULT 'Company',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_folio_routing_rules_lookup
  ON pms_folio_routing_rules (tenant_id, property_id, is_active)
  WHERE is_active = true;

-- 5. Index for listing all folios by reservation (multi-folio support)
CREATE INDEX IF NOT EXISTS idx_pms_folios_reservation_list
  ON pms_folios (tenant_id, reservation_id, status);
