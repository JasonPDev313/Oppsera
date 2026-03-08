-- ═══════════════════════════════════════════════════════════════════
-- Feature Request Enhancements
-- Adds: resolution tracking, voting, attachments
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Resolution tracking columns ─────────────────────────────────

ALTER TABLE feature_requests
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_feature_requests_vote_count
  ON feature_requests (tenant_id, vote_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_requests_resolved
  ON feature_requests (tenant_id, status, resolved_at DESC)
  WHERE status IN ('completed', 'declined');

-- ── 2. Feature Request Votes ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_request_votes (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  feature_request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_feature_request_vote UNIQUE (feature_request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fr_votes_request
  ON feature_request_votes (feature_request_id);
CREATE INDEX IF NOT EXISTS idx_fr_votes_user
  ON feature_request_votes (tenant_id, user_id);

-- RLS
ALTER TABLE feature_request_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fr_votes_tenant_isolation ON feature_request_votes;
CREATE POLICY fr_votes_tenant_isolation ON feature_request_votes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── 3. Feature Request Attachments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_request_attachments (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  feature_request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  file_name          TEXT NOT NULL CHECK (char_length(file_name) <= 255),
  mime_type          TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  data_url           TEXT NOT NULL CHECK (char_length(data_url) <= 700000), -- ~500KB base64
  size_bytes         INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288), -- 512KB max
  uploaded_by        TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fr_attachments_request
  ON feature_request_attachments (feature_request_id);

-- RLS
ALTER TABLE feature_request_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fr_attachments_tenant_isolation ON feature_request_attachments;
CREATE POLICY fr_attachments_tenant_isolation ON feature_request_attachments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Max 3 attachments per request (enforced at app layer too)
