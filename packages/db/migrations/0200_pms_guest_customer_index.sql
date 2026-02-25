-- Migration 0200: Add index on pms_guests.customer_id for customer linkage queries
-- The createReservation command filters by (tenant_id, customer_id, property_id) to find
-- linked guests — this partial index covers that path and the new CustomerWriteApi back-links.

CREATE INDEX IF NOT EXISTS idx_pms_guests_customer_id
  ON pms_guests (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;
