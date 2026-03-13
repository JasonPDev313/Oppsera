-- Migration 0312: Accounting settlement hardening
-- 1. Unique partial index on settlement lines to prevent double-matching tenders at DB level
-- 2. Source idempotency key on journal entries for deterministic dedup

-- ── Settlement line tender uniqueness ──────────────────────────────
-- Prevents the same tender from being matched to multiple settlement lines.
-- The application-level check (matchSettlementTenders) is defense-in-depth;
-- this DB constraint is the real safety net.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_lines_tenant_tender
  ON payment_settlement_lines (tenant_id, tender_id)
  WHERE tender_id IS NOT NULL;

-- ── Journal source idempotency key ────────────────────────────────
-- Deterministic key format: pos:tender:{id}, fnb:close-batch:{id},
-- payments:settlement:{id}, void:{originalId}, etc.
-- Provides module-agnostic, replay-safe dedup beyond sourceReferenceId.
ALTER TABLE gl_journal_entries
  ADD COLUMN IF NOT EXISTS source_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_journal_idempotency_key
  ON gl_journal_entries (tenant_id, source_idempotency_key)
  WHERE source_idempotency_key IS NOT NULL;
