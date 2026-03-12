-- Replace plain index with unique constraint on folio numbers
-- Advisory locks already prevent races, this adds defense-in-depth
DROP INDEX IF EXISTS idx_pms_folios_folio_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pms_folios_folio_number_unique
  ON pms_folios (tenant_id, property_id, folio_number);
