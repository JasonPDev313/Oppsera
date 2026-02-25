-- Migration: Extend impersonation sessions for Phase 1A
-- Adds target_user_id, reason, max_duration_minutes to admin_impersonation_sessions.

ALTER TABLE admin_impersonation_sessions
  ADD COLUMN IF NOT EXISTS target_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS max_duration_minutes INTEGER NOT NULL DEFAULT 60;

-- Index for looking up active sessions per admin (only one allowed)
CREATE INDEX IF NOT EXISTS idx_imp_sessions_admin_active
  ON admin_impersonation_sessions(admin_id)
  WHERE status IN ('pending', 'active');
