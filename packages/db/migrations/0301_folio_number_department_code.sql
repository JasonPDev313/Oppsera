-- Add human-readable folio number to pms_folios
ALTER TABLE pms_folios ADD COLUMN IF NOT EXISTS folio_number integer;

-- Add department/GL code to folio entries
ALTER TABLE pms_folio_entries ADD COLUMN IF NOT EXISTS department_code text;

-- Index for quick folio_number lookup per property (for generating next number)
CREATE INDEX IF NOT EXISTS idx_pms_folios_folio_number
  ON pms_folios (tenant_id, property_id, folio_number);

-- Index for department_code on entries
CREATE INDEX IF NOT EXISTS idx_pms_folio_entries_dept
  ON pms_folio_entries (folio_id, department_code);
