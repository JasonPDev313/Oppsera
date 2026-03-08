-- Add tags array column for admin tagging/categorization
ALTER TABLE feature_requests ADD COLUMN IF NOT EXISTS tags TEXT[];

-- GIN index for fast tag lookups
CREATE INDEX IF NOT EXISTS idx_feature_requests_tags ON feature_requests USING GIN (tags) WHERE tags IS NOT NULL;

-- Module-level index for aggregate queries
CREATE INDEX IF NOT EXISTS idx_feature_requests_module ON feature_requests (module);
