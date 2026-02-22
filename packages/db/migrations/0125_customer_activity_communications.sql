-- Migration 0125: Customer Activity, Communications, Relationships & Documents
-- Customer 360 Session 3: Extend communications, relationships, documents; create notes table

-- ── Extend customer_communications ─────────────────────────────────────
ALTER TABLE customer_communications ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE customer_communications ADD COLUMN IF NOT EXISTS meta_json JSONB;

-- ── Extend customer_relationships ──────────────────────────────────────
ALTER TABLE customer_relationships ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer_relationships ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE customer_relationships ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE customer_relationships ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── Extend customer_documents ──────────────────────────────────────────
ALTER TABLE customer_documents ADD COLUMN IF NOT EXISTS tags_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE customer_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ── Create customer_notes ──────────────────────────────────────────────
CREATE TABLE customer_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_notes_tenant_customer_created
  ON customer_notes(tenant_id, customer_id, created_at DESC);

-- ── RLS: customer_notes ────────────────────────────────────────────────
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_notes_select ON customer_notes
  FOR SELECT USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_notes_insert ON customer_notes
  FOR INSERT WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_notes_update ON customer_notes
  FOR UPDATE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
CREATE POLICY customer_notes_delete ON customer_notes
  FOR DELETE USING (tenant_id = (select current_setting('app.current_tenant_id', true)));
