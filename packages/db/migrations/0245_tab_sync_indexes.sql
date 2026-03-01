-- Phase 5D: Covering index for SSE tab sync polling.
--
-- The SSE endpoint polls: WHERE tenant_id = $1 AND location_id = $2 AND updated_at > $3
-- This covering index supports that query as an index-only scan.

CREATE INDEX IF NOT EXISTS idx_register_tabs_sync_poll
  ON register_tabs (tenant_id, location_id, updated_at)
  INCLUDE (status, order_id, employee_id, employee_name, tab_number, version, label, device_id);
