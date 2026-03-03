-- Add dirty_since timestamp for busser turn-time tracking
ALTER TABLE fnb_table_live_status ADD COLUMN IF NOT EXISTS dirty_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fnb_table_live_status_dirty
  ON fnb_table_live_status (tenant_id, dirty_since)
  WHERE status = 'dirty' AND dirty_since IS NOT NULL;
