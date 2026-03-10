-- Add unique constraint on folio_number per property to enforce data integrity.
-- The advisory lock in application code serializes concurrent inserts; this
-- constraint provides a hard database-level guarantee as a second line of defense.
-- Partial index (WHERE folio_number IS NOT NULL) allows NULLs for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_folios_folio_number
  ON pms_folios (tenant_id, property_id, folio_number)
  WHERE folio_number IS NOT NULL;
