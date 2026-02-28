-- 0236_gl_document_attachments.sql
-- Attach receipts, invoices, and documents to GL journal entries for audit compliance.

CREATE TABLE IF NOT EXISTS gl_document_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  journal_entry_id TEXT NOT NULL REFERENCES gl_journal_entries(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, jpg, png, xlsx, csv, doc, docx
  file_size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL, -- S3 / Supabase Storage key
  description TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gl_doc_attachments_tenant_journal
  ON gl_document_attachments (tenant_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_gl_doc_attachments_tenant
  ON gl_document_attachments (tenant_id);

-- RLS
ALTER TABLE gl_document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_document_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY gl_doc_attach_select ON gl_document_attachments
  FOR SELECT USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_doc_attach_insert ON gl_document_attachments
  FOR INSERT WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_doc_attach_update ON gl_document_attachments
  FOR UPDATE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));

CREATE POLICY gl_doc_attach_delete ON gl_document_attachments
  FOR DELETE USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true)));
