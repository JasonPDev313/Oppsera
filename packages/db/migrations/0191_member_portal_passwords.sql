-- Migration 0191: Add password_hash column to customer_auth_accounts for member portal auth
ALTER TABLE customer_auth_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;
