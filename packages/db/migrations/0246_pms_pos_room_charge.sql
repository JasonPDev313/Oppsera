-- Migration 0246: PMS ↔ POS Room Charge Integration
-- Adds folio linking to register tabs and room charge transaction types

-- ── Register Tabs: folio columns ──────────────────────────────────
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS folio_id TEXT;
ALTER TABLE register_tabs ADD COLUMN IF NOT EXISTS guest_name TEXT;

CREATE INDEX IF NOT EXISTS idx_register_tabs_folio
  ON register_tabs (tenant_id, folio_id)
  WHERE folio_id IS NOT NULL;

-- ── System Transaction Types: room_charge + folio_settlement ──────
INSERT INTO gl_transaction_types (id, tenant_id, code, name, category, description, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, NULL, 'room_charge', 'Room Charge', 'tender', 'Charge to guest room folio', 65, true, now(), now()),
  (gen_random_uuid()::text, NULL, 'folio_settlement', 'Folio Settlement', 'tender', 'Payment of guest folio balance at POS', 66, true, now(), now())
ON CONFLICT DO NOTHING;
