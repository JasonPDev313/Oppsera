-- Feature Requests table for user-submitted feature requests, enhancements, and bug reports
CREATE TABLE IF NOT EXISTS feature_requests (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  location_id     TEXT,
  submitted_by    TEXT NOT NULL,
  submitted_by_name  TEXT,
  submitted_by_email TEXT,
  request_type    TEXT NOT NULL CHECK (request_type IN ('feature', 'enhancement', 'bug')),
  module          TEXT NOT NULL,
  submodule       TEXT,
  title           TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description     TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  business_impact TEXT CHECK (business_impact IS NULL OR char_length(business_impact) <= 1000),
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  additional_notes TEXT CHECK (additional_notes IS NULL OR char_length(additional_notes) <= 1000),
  current_workaround TEXT CHECK (current_workaround IS NULL OR char_length(current_workaround) <= 500),
  status          TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'planned', 'in_progress', 'completed', 'declined')),
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_requests_tenant ON feature_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_submitted_by ON feature_requests (tenant_id, submitted_by);
-- Rate-limit lookups: user's submissions today
CREATE INDEX IF NOT EXISTS idx_feature_requests_user_created ON feature_requests (tenant_id, submitted_by, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION feature_requests_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feature_requests_updated_at ON feature_requests;
CREATE TRIGGER trg_feature_requests_updated_at
  BEFORE UPDATE ON feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION feature_requests_set_updated_at();

-- RLS
ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_requests_tenant_isolation ON feature_requests;
CREATE POLICY feature_requests_tenant_isolation ON feature_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
