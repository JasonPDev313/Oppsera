-- Add metadata JSONB column to platform_restore_operations for restore progress tracking.
-- Stores: { phase, currentTable, tableIndex, totalTables, rowsInserted, updatedAt }
ALTER TABLE platform_restore_operations
  ADD COLUMN IF NOT EXISTS metadata JSONB;
