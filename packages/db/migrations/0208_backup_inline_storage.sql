-- Add compressed_data BYTEA column to platform_backups for database-backed storage.
-- This allows backups to work on Vercel and other serverless environments
-- where the filesystem is read-only and ephemeral.

ALTER TABLE platform_backups
  ADD COLUMN IF NOT EXISTS compressed_data BYTEA;

-- Add a comment explaining the column
COMMENT ON COLUMN platform_backups.compressed_data IS
  'Gzip-compressed JSON backup payload. Used when storage_driver=database (Vercel/serverless). NULL when storage_driver=local (filesystem).';
