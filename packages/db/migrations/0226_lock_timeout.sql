-- Migration 0226: Set lock_timeout at database level
-- Prevents queries from waiting indefinitely for row/table locks.
-- If a lock can't be acquired within 5s, the statement is aborted.
-- This is a safety net for the application-level semaphore and circuit breaker:
--   - Semaphore (pool-guard.ts) limits concurrency to POOL_MAX + 2
--   - Circuit breaker trips on pool exhaustion → fail-fast for 10s
--   - lock_timeout is the DB-level backstop if both are bypassed
--
-- NOTE: ALTER DATABASE is idempotent — safe to re-run.
-- NOTE: This does NOT use session-level connection params (which Supavisor rejects).

ALTER DATABASE postgres SET lock_timeout = '5s';
