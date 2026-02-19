-- Enable pg_trgm extension for fast ILIKE pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fast customer search (ILIKE '%pattern%')
-- These turn sequential scans into index scans for POS customer lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_display_name_trgm
  ON customers USING gin (display_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email_trgm
  ON customers USING gin (email gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING gin (phone gin_trgm_ops);
