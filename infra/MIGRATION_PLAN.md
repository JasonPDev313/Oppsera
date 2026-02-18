# Vercel Limits Audit & Container Migration Plan

> **Last updated:** Feb 2026
> **Source of truth (code):** `infra/LIMITS_AND_MIGRATION.ts` — run `npx tsx infra/LIMITS_AND_MIGRATION.ts`
> **Growth trajectory:** 10 locations now → 100 Y1 → 1,000 Y2 → 5,000 Y3

---

## Phase 1A: Vercel Limits Map

| Limit | Pro (2026) | Enterprise | We Hit This When | Impact |
|---|---|---|---|---|
| **Function timeout** | 300s default, **800s max** (Fluid Compute) | Same | Job > 800s (bulk migration, huge settlement) | Function killed. Tx rolls back. |
| **Function memory** | 2 GB default, **4 GB max** (2 vCPU) | Same | >100K rows in memory, PDF gen | OOM → 502 |
| **Request payload** | **4.5 MB** | Same | Bulk CSV import in body | 413 error |
| **Response payload** | **4.5 MB** | Same | Large report export | Truncated |
| **Concurrent executions** | **30,000** | 100,000+ | Not a practical concern | Throttled requests |
| **Cold start** | 250ms–3s (reduced 50-80% by Fluid Compute) | Same | Always — POS terminals notice | Latency spikes |
| **Cron frequency** | **1/minute** (100 jobs/project) | Same | Outbox needs <5s polling | Up to 60s event delay |
| **Build time** | **45 min** (30 vCPU machines) | Same | Monorepo grows past 20+ packages | Deploy failures |
| **Bandwidth** | **1 TB/mo** included | Custom | ~Stage 3 at 500GB/mo | $0.15/GB overage |
| **Function invocations** | **1M/mo** included | Custom | ~Stage 3 at 1.3M/mo | $0.60/M overage |
| **Edge middleware** | 25s start, 300s stream | Same | Unlikely (JWT verify only) | Timeout |
| **Env vars** | **1,000/env** (64 KB total) | Same | Not a concern | N/A |
| **Runtime logs** | **1 day retention** | 3 days | Day 1 — ship to external aggregator | Can't debug old issues |

**Key corrections from 2024 estimates:**
- Function timeout increased from 60s → 800s (Fluid Compute)
- Memory increased from 1 GB → 4 GB max
- Concurrent executions: 30,000 (not ~1,000)
- Env vars: 1,000 (not 64)

---

## Phase 1B: Supabase Limits Map

### Compute Tiers (Pro $25/mo base + compute)

| Tier | vCPUs | RAM | Direct Conns | Pooler Conns | Max DB | $/mo |
|---|---|---|---|---|---|---|
| **Micro** | 2 (shared) | 1 GB | 60 | 200 | 10 GB | ~$10* |
| **Small** | 2 (shared) | 2 GB | 90 | 400 | 50 GB | ~$15 |
| **Medium** | 2 (shared) | 4 GB | 120 | 600 | 100 GB | ~$60 |
| **Large** | 2 (dedicated) | 8 GB | 160 | 800 | 200 GB | ~$110 |
| **XL** | 4 (dedicated) | 16 GB | 240 | 1,000 | 500 GB | ~$210 |
| **2XL** | 8 (dedicated) | 32 GB | 380 | 1,500 | 1 TB | ~$410 |

*$10/mo compute credit included with Pro — Micro is effectively free.

### Key Features by Plan

| Feature | Pro ($25/mo) | Team ($599/mo) |
|---|---|---|
| Read replicas | **Yes** (priced per tier) | Yes |
| PITR | **Add-on available** | Available |
| Daily backups | 7-day retention | 14-day retention |
| SOC2 compliance | No | **Yes** |
| SSO/SAML | No | **Yes** |
| Priority support | No | **Yes** |

**Key correction:** Read replicas and PITR are available on Pro — Team is for compliance features only, not database features. This dramatically changes the cost crossover point.

---

## Phase 2: Cost Curve Projections

### Summary Table

| Stage | Locations | Orders/mo | Vercel+Supabase | AWS (ECS+RDS) | Azure | Winner |
|---|---|---|---|---|---|---|
| **Launch** | 10 | 5K | **$45/mo** | $109/mo | $104/mo | Vercel |
| **Stage 2** | 100 | 80K | **$175/mo** | $313/mo | $370/mo | Vercel |
| **Stage 3** | 1,000 | 800K | **$505/mo** | $635/mo | $705/mo | Vercel |
| **Stage 4** | 5,000 | 4M | $2,595/mo | **$1,195/mo** | $1,285/mo | AWS |

### Stage-by-Stage Breakdown

**Launch (10 locations, 15 terminals)**
```
Vercel Pro:     $20
Supabase Pro:   $25 (Micro tier — covered by $10 credit)
Upstash Redis:  $0  (free tier)
─────────────────
Total:          $45/mo
```

**Stage 2 (100 locations, 200 terminals)**
```
Vercel Pro:         $20
Supabase Pro:       $25
Supabase Compute:   $50  (Medium tier: $60 - $10 credit)
Supabase Replica:   $60  (Medium read replica)
Upstash Redis:      $20  (~10M cmds/mo)
─────────────────────
Total:              $175/mo
```
*No Team plan needed. Pro + Medium compute + read replica handles 100 locations.*

**Stage 3 (1,000 locations, 2,000 terminals)**
```
Vercel Pro:              $20
Vercel Function Overage: $180  (1.3M invocations, $0.60/M × 300K over)
Supabase Pro:            $25
Supabase Compute:        $200  (Large tier $110 + replica $110 - credit)
Upstash Redis:           $80   (~50M cmds/mo)
─────────────────────────
Total:                   $505/mo
```
*Function invocation overages start to appear. Upstash approaching ElastiCache crossover.*

**Stage 4 (5,000 locations, 8,000 terminals)**
```
Vercel Pro:              $20
Vercel Function Overage: $1,800  (4M invocations, $0.60/M × 3M over)
Vercel Bandwidth:        $150    (~2TB, $0.15/GB × 1TB over)
Supabase Pro:            $25
Supabase Compute:        $400    (XL $210 + replica $210 - credit)
Upstash Redis:           $200
─────────────────────────
Total:                   $2,595/mo
```
*Function invocations become the dominant cost. This is where containers win.*

### Crossover Analysis

**Previous estimate:** ~50-100 locations
**Corrected estimate:** ~2,000-3,000 locations

The crossover shifted because:
1. Supabase Pro now includes read replicas (was Team-only)
2. PITR is a Pro add-on (was Team-only)
3. Compute tiers scale independently — no $599/mo jump for features
4. Vercel limits increased dramatically (800s timeout, 30K concurrent)

**The real migration drivers are NOT cost. They are:**
1. Operational control (custom Postgres config, PgBouncer tuning)
2. Compliance (SOC2 without $599/mo Team plan — AWS handles this with your own compliance)
3. Function invocation overages at very high request volume (>3M/mo)
4. Runtime log retention (Vercel: 1 day — unacceptable for production debugging)
5. Cold start elimination for POS latency-sensitive workloads

---

## Phase 3: Migration Trigger Framework

### Decision Matrix

| Priority | Trigger | Metric | Threshold | Component | Lead Time |
|---|---|---|---|---|---|
| CRITICAL | Concurrent ceiling | Throttled requests | >0.5% throttled | API → ECS | 3 weeks |
| CRITICAL | Connection pool | DB connection errors | Any 503 from pool | DB → RDS | 5 weeks |
| HIGH | Cold start impact | Cold start % on POS | >5% with >500ms lag | API → ECS | 3 weeks |
| HIGH | Database size | GB on disk | >80% of tier limit | Upgrade tier or RDS | 6 weeks |
| HIGH | Read replica need | POS P95 during reports | >200ms | Add replica | 3 weeks |
| HIGH | Outbox dispatch lag | Oldest unpublished event | >15s consistently | Container worker | 2 weeks |
| HIGH | Log retention | Debugging need | >24h lookback needed | External aggregator | 1 week |
| MEDIUM | Function timeout | Job duration | >750s consistently | Container worker | 3 weeks |
| MEDIUM | Cost crossover | Function invocation $ | >$500/mo overage, 2 months | API → ECS | 8 weeks |
| MEDIUM | Compliance | Customer/regulatory | SOC2, HIPAA, residency | Full migration | 12 weeks |
| LOW | Custom PG config | Perf tuning need | Config unavailable on Supabase | DB → RDS | 5 weeks |

### How to Measure Each Trigger

**Connection pool exhaustion:**
```sql
-- Supabase dashboard: pooler connection count
-- Or structured logs:
-- Search for "too many clients" or FATAL connection errors
-- Try first: verify pool size = 2, ensure prepare: false, upgrade compute tier
```

**Cold start impact:**
```
-- Structured logs: filter where coldStart=true on POS paths
-- Calculation: cold_requests / total_requests on /api/v1/orders*
-- Try first: Fluid Compute (default), keep-warm cron, reduce bundle
```

**Database size:**
```sql
SELECT pg_database_size(current_database()) / 1024^3 AS gb;
-- Try first: VACUUM FULL, archive old audit_log, upgrade compute tier
```

**Outbox dispatch lag:**
```sql
SELECT extract(epoch from now() - min(created_at))
FROM event_outbox WHERE published_at IS NULL;
-- Also: GET /api/admin/health → jobs.oldestAgeSecs
-- Try first: optimize batch size, add cron trigger, deploy Fly.io worker ($5/mo)
```

**POS P95 during reports:**
```
-- Structured logs: percentile(durationMs, 0.95)
-- WHERE path LIKE '/api/v1/orders%'
-- AND timestamp BETWEEN report_start AND report_end
-- Try first: schedule reports off-peak, statement_timeout, add read replica
```

---

## Phase 4: Component Migration Plans

### 4A — Database: Supabase → AWS RDS

> **Likely first migration** (operational control, not cost)
> **Code change:** `DATABASE_URL` environment variable only
> **Downtime:** <5 minutes

#### Pre-Migration
1. Provision RDS Postgres 16 via Terraform (`infra/terraform/main.tf`)
2. Configure: `shared_buffers`, `work_mem`, `max_connections`
3. Set up PgBouncer (ECS sidecar) — or use RDS Proxy
4. Install extensions: `pgcrypto`, `pg_trgm`, `pg_stat_statements`
5. Set up automated backups + PITR (14-day retention)
6. Optionally: read replica (if needed at this stage)

#### Migration Steps
1. Set up logical replication: Supabase → RDS (continuous sync)
2. Run validation: `infra/migration/db-migration-checklist.sql` on both
3. Test application against RDS (staging deploy with new `DATABASE_URL`)
4. Load test against RDS (k6 ci-fast profile)
5. Cutover window:
   - Set application to maintenance mode
   - Verify replication caught up (`pg_stat_replication.replay_lag = 0`)
   - Update `DATABASE_URL` in Vercel env vars (or ECS secrets)
   - Restart application
   - Verify `/api/health` returns healthy
6. Remove `prepare: false` from postgres.js config (no longer needed without Supavisor)

#### Post-Migration
- Supabase Auth continues working (independent database)
- Update connection string in deployment config
- Verify RLS policies work on new instance
- Monitor for 1 week before decommissioning Supabase DB
- Can increase pool size from 2 → 5+ per instance

#### Rollback
- Re-point `DATABASE_URL` back to Supabase
- Logical replication keeps Supabase in sync during monitoring period

#### Terraform Commands
```bash
cd infra/terraform
terraform init
terraform plan -var="environment=production" -var="acm_certificate_arn=arn:aws:acm:..."
terraform apply
```

---

### 4B — Workers: In-Process → Container

> **Trigger:** Job duration > 750s, or outbox lag > 15s
> **Code change:** `USE_CONTAINER_WORKERS=true`
> **Downtime:** Zero

#### Already Built
- Worker entry point: `infra/worker.ts`
- Dockerfile: `infra/docker/Dockerfile.worker`
- Docker Compose service: `infra/docker-compose.yml` (worker service)
- ECS task definition: `infra/terraform/main.tf`

#### Migration Steps
1. Build and push worker image:
   ```bash
   docker build -f infra/docker/Dockerfile.worker -t oppsera-worker .
   # Push to ECR (or Docker Hub for VPS)
   ```
2. Deploy worker container (ECS task or Docker Compose)
3. Set `USE_CONTAINER_WORKERS=true` in Vercel env vars
4. In-process outbox worker stops automatically (feature flag check)
5. Container worker picks up from outbox table
6. Verify via `/api/admin/health` — outbox lag should drop

#### Rollback
- Set `USE_CONTAINER_WORKERS=false`
- In-process worker resumes on next deployment

---

### 4C — API: Vercel → ECS / Container Apps

> **Trigger:** Cold starts unacceptable, function invocations > $500/mo
> **Code change:** DNS update, remove Vercel-specific headers
> **Downtime:** Zero (blue/green or DNS failover)

#### Already Built
- Dockerfile: `infra/docker/Dockerfile.web`
- Terraform: `infra/terraform/main.tf` (ECS service + ALB + auto-scaling)
- CI/CD: `.github/workflows/deploy-aws.yml`
- Health check: `GET /api/health`

#### Migration Steps
1. Build and push web image to ECR
2. Terraform apply (creates ECS service, ALB, security groups)
3. Smoke test against ALB DNS
4. Run load test against ALB endpoint
5. DNS cutover:
   - Add ALB as a weighted DNS record (10% traffic)
   - Monitor error rates and latency
   - Increase to 50%, then 100%
   - Remove Vercel DNS records

#### Auto-Scaling Configuration (from Terraform)
```
Min tasks: 2, Max tasks: 6
Target CPU: 70%
Scale-out cooldown: 60s
Scale-in cooldown: 300s
```

#### Rollback
- DNS failover back to Vercel (still deployed, just not receiving traffic)

---

### 4D — Auth: Supabase Auth → Self-Hosted

> **Trigger:** Only if forced (Supabase Auth pricing, custom auth flows)
> **This is the LAST migration — avoid if possible**
> **Risk:** Highest (breaking auth = locking out all users)

#### Options (if needed)
1. **Self-hosted GoTrue** (Supabase's auth service, open source)
2. **NextAuth.js / Auth.js** (popular Next.js solution)
3. **Clerk** (managed, but not self-hosted)

#### Why to Avoid
- Supabase Auth works independently of Supabase DB
- No additional cost (included in base plan)
- Battle-tested JWT generation and verification
- Handles MFA, social login, magic links out of the box

---

## Phase 5: Migration-Ready Code (Already Implemented)

### 5A — Environment Abstraction

**File:** `packages/core/src/config/deployment.ts`

Auto-detects deployment target and adjusts configuration:
- `VERCEL` env var → Vercel serverless (pool: 2)
- `ECS_CONTAINER_METADATA_URI` → Container (pool: 10)
- Neither → Local development (pool: 5)

### 5B — Feature Flags

**File:** `packages/core/src/config/feature-flags.ts`

| Flag | Purpose | Default |
|---|---|---|
| `USE_READ_REPLICA` | Route reads to replica | off |
| `USE_REDIS_CACHE` | Enable Redis caching | off |
| `USE_CONTAINER_WORKERS` | Dedicated worker containers | off |
| `LOG_REQUESTS_TO_DB` | Persist request logs | off |
| `ENABLE_ADMIN_METRICS` | Admin dashboard endpoints | on |
| `ENABLE_STRIPE_BILLING` | Stripe integration | off |

### 5C — Observability Stack

| Component | File | Works On |
|---|---|---|
| Structured logger | `packages/core/src/observability/logger.ts` | Vercel + Container |
| Sentry integration | `apps/web/sentry-config/` | Vercel + Container |
| DB health monitor | `packages/core/src/observability/db-health.ts` | Vercel + Container |
| Job health monitor | `packages/core/src/observability/job-health.ts` | Vercel + Container |
| Request metrics | `packages/core/src/observability/request-metrics.ts` | Vercel + Container |
| Slack alerts | `packages/core/src/observability/alerts.ts` | Vercel + Container |

---

## Phase 6: Pre-Migration Checklist

### Done (15/21)

- [x] `Dockerfile.web` exists and builds — `infra/docker/Dockerfile.web`
- [x] `Dockerfile.worker` exists and builds — `infra/docker/Dockerfile.worker`
- [x] Docker Compose for local dev — `infra/docker-compose.yml`
- [x] Environment abstraction — `packages/core/src/config/deployment.ts`
- [x] `DATABASE_URL` is only Supabase-specific DB config — `.env.example`
- [x] Worker handlers are pure functions — `infra/worker.ts`
- [x] Health check (public) — `GET /api/health`
- [x] Health check (admin) — `GET /api/admin/health`
- [x] Structured JSON logging to stdout — `packages/core/src/observability/logger.ts`
- [x] Feature flags for gradual migration — `packages/core/src/config/feature-flags.ts`
- [x] Terraform IaC for AWS — `infra/terraform/main.tf`
- [x] CI/CD for ECS deployment — `.github/workflows/deploy-aws.yml`
- [x] Load test suite — `.github/workflows/load-test.yml`
- [x] DB migration validation queries — `infra/migration/db-migration-checklist.sql`
- [x] `.env.example` for onboarding — `.env.example`

### Partial (1/21)

- [~] Sentry error tracking — configs exist in `apps/web/sentry-config/`, but `@sentry/nextjs` not yet installed

### TODO (5/21)

- [ ] Ship logs to external aggregator (Axiom/Datadog/Grafana Cloud)
- [ ] Cost tracking dashboard (know current monthly spend)
- [ ] Rate limiting on API routes
- [ ] CORS configuration for production
- [ ] Install `@sentry/nextjs` and verify error capture

---

## Quick Reference: What Changes In Code Per Migration

| Migration | Code Change | Config Change |
|---|---|---|
| **DB → RDS** | Nothing | `DATABASE_URL`, remove `prepare: false` |
| **Workers → Container** | Nothing | `USE_CONTAINER_WORKERS=true` |
| **API → ECS** | Remove Vercel env detection (optional) | DNS, deploy pipeline |
| **Redis → ElastiCache** | Nothing | `REDIS_URL` |
| **CDN → CloudFront** | Nothing | DNS, static asset config |
| **Auth → self-hosted** | JWT verification middleware | Auth env vars |

---

## Appendix: AWS vs Azure Comparison

| Component | AWS | Azure |
|---|---|---|
| Containers | ECS Fargate ($0.032/vCPU-hr ARM) | Container Apps ($0.086/vCPU-hr) |
| Database | RDS Postgres 16 ($0.072/hr t4g.medium) | Flexible Server ($0.10/hr D2s_v3) |
| Cache | ElastiCache ($0.109/hr t3.medium) | Azure Cache ($0.109/hr similar) |
| CDN | CloudFront ($15/mo Pro plan) | Azure CDN (~$15/mo) |
| Load Balancer | ALB ($16/mo + LCU) | Built into Container Apps |
| Secrets | SSM Parameter Store (free) | Key Vault (~$0.03/10K ops) |
| CI/CD | ECR + ECS deploy | ACR + Container Apps deploy |

**Recommendation:** AWS (ECS Fargate) for lower container costs (ARM/Graviton), more mature Postgres offering (RDS), and better Terraform ecosystem. Azure is viable if the team has Azure expertise.

---

## Appendix: Redis Crossover (Upstash vs ElastiCache)

| Monthly Commands | Upstash Cost | ElastiCache (t3.medium) |
|---|---|---|
| 1M | ~$2 | $80 |
| 10M | ~$20 | $80 |
| 50M | ~$100 | $80 |
| 100M | ~$200 | $80 |
| 500M | ~$1,000 | $80 |

**Crossover:** ~40M commands/month. Below that, Upstash wins. Above, ElastiCache (flat rate) wins.
**For OppsEra:** Stage 1-2 = Upstash. Stage 3+ = evaluate based on actual command volume.
