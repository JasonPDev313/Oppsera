# Infrastructure Reference — On-Demand

> Read this file when working on deployment, database config, connection pooling, background jobs, or observability.
> Referenced from CLAUDE.md — do NOT duplicate this content back into CLAUDE.md.

## Staged Deployment Path (Updated Feb 2026)

```
Stage 1 (10 locations):     Vercel Pro + Supabase Pro Micro (~$45/mo)
Stage 2 (100 locations):    + Supabase Medium compute + read replica + Redis (~$175/mo)
Stage 3 (1,000 locations):  + Supabase Large compute (~$505/mo) — still on Vercel
Stage 4 (5,000 locations):  AWS ECS + RDS + ElastiCache (~$1,195/mo) — containers win
```
Cost crossover at ~2,000-3,000 locations (NOT ~100 as previously estimated).
Real migration drivers: compliance, cold starts, log retention — not cost.
See `infra/MIGRATION_PLAN.md` and `infra/LIMITS_AND_MIGRATION.ts` for full analysis.

## Connection Pooling (Vercel + Supavisor)

```typescript
// postgres.js config for Vercel serverless
const pool = postgres(DATABASE_URL, {
  max: 2,              // low per-instance (many concurrent instances)
  prepare: false,       // REQUIRED for Supavisor transaction mode
  idle_timeout: 20,
  max_lifetime: 300,
});
```

### Pool Guard & Circuit Breaker (Added March 2026)

The pool guard layer sits between application code and postgres.js, providing:

1. **Semaphore**: caps concurrent DB operations to `max` (2 on Vercel) — prevents queue buildup
2. **Circuit breaker**: trips after N failures within a sliding time window, auto-resets after a success window
3. **Stale-connection retry**: detects `ECONNRESET` / `57P01` (Supavisor backend recycling) and retries once on a fresh connection
4. **Zombie tracking**: monitors connections that haven't returned within timeout — logs but doesn't kill (avoids breaking in-flight transactions)

```typescript
// Circuit breaker states
CLOSED  → normal operation, passes all requests
OPEN    → tripped after failureThreshold within failureWindow — rejects immediately
HALF_OPEN → after resetTimeout, allows one probe request — success→CLOSED, failure→OPEN
```

**Key rules**:
- **Failure window** (not just count): 5 failures in 30s trips the breaker, but 5 failures over 10 minutes does not
- **Manual reset**: `POST /api/admin/pool/reset-breaker` for emergency recovery without restart
- **Health endpoint safety**: `/api/health` returns 200 even when breaker is tripped — prevents health-check traffic from worsening an outage
- **DB loops must serialize**: `for...of` (not `Promise.all`) for batch DB operations to stay within pool max:2

### Stale Connection Detection

Supavisor recycles backend Postgres connections periodically. Between requests, a previously-valid connection may be terminated. Detect and handle:

```typescript
// Error codes indicating stale connection
const STALE_CODES = ['ECONNRESET', '57P01']; // 57P01 = admin_shutdown

// In pool guard: catch → discard connection → retry once on fresh connection
// Only retry ONCE — if the retry also fails, propagate the error
```

## Postgres Tuning

```
statement_timeout = 30s
idle_in_transaction_session_timeout = 60s
lock_timeout = 5s
```
Per-table autovacuum for write-heavy tables (orders, inventory_movements, event_outbox):
`autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02`

## Background Jobs

Postgres-native job system using `SKIP LOCKED` (no pg-boss/BullMQ/Redis at Stage 1):
- Tables: `background_jobs`, `background_job_attempts`, `scheduled_jobs`
- JobWorker polls with `FOR UPDATE SKIP LOCKED` for lock-free concurrency
- Tenant fairness: `maxJobsPerTenantPerPoll` cap prevents noisy neighbors
- Lease + heartbeat mechanism for crash recovery
- On Vercel: Vercel Cron pings `/api/v1/internal/drain-jobs` every minute as safety net

## Tenant Tiers

```
small:      ≤5 locations, 100 req/min, 10 concurrent jobs
medium:     ≤20 locations, 500 req/min, 25 concurrent jobs
large:      ≤100 locations, 2000 req/min, 50 concurrent jobs
enterprise: unlimited, 5000 req/min, 100 concurrent jobs
```

## Observability

- **Sentry** for error tracking + performance tracing (Stage 1)
- **pg_stat_statements** enabled from day 1 — review weekly for top-20 slowest queries
- Structured JSON logging with `tenantId`, `requestId`, `duration` on every request
- Stock alerts: `inventory.low_stock.v1`, `inventory.negative.v1` events for monitoring
