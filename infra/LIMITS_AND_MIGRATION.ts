/**
 * Vercel Limits Audit & Container Migration Plan
 *
 * This file is the single source of truth for:
 * - Vercel + Supabase concrete limits (updated Feb 2026)
 * - Cost projections at each growth stage
 * - Migration trigger thresholds
 * - Decision matrix
 *
 * Run: npx tsx infra/LIMITS_AND_MIGRATION.ts
 * Outputs the current assessment to stdout.
 *
 * Sources:
 *   https://vercel.com/docs/limits
 *   https://vercel.com/docs/functions/limitations
 *   https://vercel.com/pricing
 *   https://supabase.com/pricing
 *   https://supabase.com/docs/guides/platform/compute-and-disk
 *   https://aws.amazon.com/fargate/pricing/
 *   https://aws.amazon.com/rds/postgresql/pricing/
 */

// ── Phase 1A: Vercel Limits Map (Feb 2026) ──────────────────────────

export const VERCEL_LIMITS = {
  functionTimeout: {
    proDefaultSeconds: 300,         // 5 min default
    proMaxSeconds: 800,             // 13+ min with Fluid Compute
    enterpriseMaxSeconds: 800,      // same — Fluid Compute is available on Pro
    note: 'Fluid Compute (bytecode caching + pre-warming) ships on all plans since 2025',
    hitsWhen: 'Any background job > 800s (large data migration, heavy batch), or needing truly unlimited runtime',
    projectedStage: 'Stage 2 (100+ locations) — bulk import or end-of-day settlement that exceeds 13 min',
    impact: 'Function killed mid-execution. If inside a transaction, Postgres rolls back safely. If mid-batch without checkpointing, partial progress lost.',
    workaround: 'Break into continuation-token chunks, use streaming, or move to container worker',
  },
  functionMemory: {
    defaultMB: 2048,    // 2 GB default (1 vCPU)
    maxMB: 4096,        // 4 GB max (2 vCPU)
    note: 'Configurable per-function via vercel.json or export const maxDuration/memory',
    hitsWhen: 'Large JSON processing (>100K rows in memory), PDF generation, bulk transforms',
    projectedStage: 'Stage 2 (100+ locations) — month-end reports across all locations',
    impact: 'OOM crash → 502 error to client',
    workaround: 'Stream processing, pagination, move heavy jobs to worker container',
  },
  requestPayloadMB: {
    limit: 4.5,
    hitsWhen: 'Bulk CSV import in request body, large image upload',
    projectedStage: 'Stage 1 — CSV imports for legacy data migration',
    impact: '413 Payload Too Large error',
    workaround: 'Presigned S3/Supabase Storage upload → process async, or chunk uploads',
  },
  responsePayloadMB: {
    limit: 4.5,
    hitsWhen: 'Large report exports, full data dumps, big CSV downloads',
    projectedStage: 'Stage 2 — monthly financial exports with 100K+ rows',
    impact: 'Truncated response, broken download',
    workaround: 'Streaming response (ReadableStream), S3 presigned URL for downloads',
  },
  concurrentExecutions: {
    pro: 30_000,              // Vercel docs: up to 30,000 (Pro)
    enterprise: 100_000,      // 100K+ (Enterprise)
    note: 'These are account-level concurrent invocations, not per-function',
    hitsWhen: 'Extremely unlikely to hit 30K concurrent — would mean 30K active API calls at once',
    projectedStage: 'Not a practical concern even at Stage 4 (5,000 locations)',
    impact: 'Requests queued or dropped, POS terminals time out',
    workaround: 'Optimize slow endpoints, request coalescing, provisioned concurrency',
  },
  coldStartMs: {
    typical: { min: 250, max: 3000 },
    fluidComputeReduction: '50-80% reduction with Fluid Compute (bytecode caching)',
    archivedFunctionPenalty: '1+ second additional on first invocation after inactivity',
    hitsWhen: 'Every idle function instance, auto-scaling events, after deploy',
    projectedStage: 'Always present — POS terminals notice 500ms+ lag on first request',
    impact: 'POS latency spikes on first request after idle. P95 > 1s for cold functions without Fluid Compute.',
    workaround: 'Fluid Compute (enabled by default), keep-warm pings, minimize bundle size, reduce dependencies',
  },
  cronMinFrequency: {
    seconds: 60,              // 1/minute minimum
    maxCronJobs: 100,         // per project
    note: 'Pro plan has no minimum frequency restriction — can run every minute',
    hitsWhen: 'Outbox dispatcher needs <5s polling for near-real-time event processing',
    projectedStage: 'Stage 1 — outbox lag becomes noticeable with >10 events/minute',
    impact: 'Up to 60s delay between event emit and consumer execution',
    workaround: 'In-process outbox worker (current approach), or deploy a tiny dedicated poller on Fly.io/Railway ($5/mo)',
  },
  buildTime: {
    limitMinutes: 45,
    buildMachine: '30 vCPUs, 60 GB memory (Turbo build machines, default for new projects)',
    concurrentBuilds: 12,     // Pro
    hitsWhen: 'Monorepo with 20+ packages, heavy type checking, Sentry source maps',
    projectedStage: 'Stage 2 — build time creeping past 15-20 minutes',
    impact: 'Deploy failures, slow iteration',
    workaround: 'Turborepo remote cache, selective builds, split deploy pipelines',
  },
  bandwidth: {
    fastDataTransferGB: 1000,         // 1 TB/month included
    edgeRequestsIncluded: 10_000_000, // 10M/month
    functionInvocationsIncluded: 1_000_000, // 1M/month
    overageDataTransfer: 0.15,        // $/GB
    overageEdgeRequests: 2.00,        // $/million
    overageFunctionInvocations: 0.60, // $/million
    hitsWhen: 'High API traffic + large responses (reports, images)',
    projectedStage: 'Stage 3 — ~500GB/month at 5K req/min average (within 1TB)',
    impact: 'Overage charges at $0.15/GB for data, $0.60/M for function invocations',
    workaround: 'CDN caching for static, compress API responses, S3 for large files',
  },
  edgeMiddleware: {
    timeoutSeconds: 25,               // must begin response within 25s
    streamingDurationSeconds: 300,     // can stream for up to 5 min
    hitsWhen: 'Complex auth checks with multiple DB lookups in middleware',
    projectedStage: 'Unlikely — current middleware is lightweight (JWT verify only)',
    impact: 'Middleware timeout, request rejected',
    workaround: 'Keep middleware thin, move heavy logic to route handler',
  },
  envVarsPerEnvironment: {
    limit: 1000,              // 1,000 per environment per project (updated 2025)
    totalSizeLimit: '64 KB',  // combined names + values
    note: 'Was 64 env vars previously — now 1,000 with 64KB total size limit',
    hitsWhen: 'Unlikely to hit 1,000 env vars',
    projectedStage: 'Not a practical concern',
    impact: 'N/A — 64KB total size may matter with large JSON env vars',
    workaround: 'Use SSM Parameter Store / Secrets Manager for large configs',
  },
  deployments: {
    perDay: 6000,       // Pro
    perHour: 450,       // Pro
    enterprisePerDay: 24_000,
    enterprisePerHour: 1_800,
    note: 'Not a practical concern for our deployment frequency',
  },
  runtimeLogs: {
    proRetentionDays: 1,
    enterpriseRetentionDays: 3,
    note: 'Very short retention — must ship to external log aggregator for production use',
    workaround: 'Ship structured JSON logs to Datadog/Grafana/Axiom from day 1',
  },
} as const;

// ── Phase 1B: Supabase Limits (Feb 2026) ────────────────────────────

export const SUPABASE_LIMITS = {
  pricing: {
    proBase: 25,      // $/month
    teamBase: 599,    // $/month (SOC2, SAML, priority support)
    computeCreditsIncluded: 10, // $/month on Pro
    note: 'Pro includes $10/mo compute credit. Compute tier determines connections, memory, and max DB size.',
  },
  computeTiers: [
    { name: 'Micro',  vCPUs: '2 (shared)', ramGB: 1,   directConns: 60,  poolerConns: 200,   maxDBSizeGB: 10,   pricePerMonth: 10   },
    { name: 'Small',  vCPUs: '2 (shared)', ramGB: 2,   directConns: 90,  poolerConns: 400,   maxDBSizeGB: 50,   pricePerMonth: 15   },
    { name: 'Medium', vCPUs: '2 (shared)', ramGB: 4,   directConns: 120, poolerConns: 600,   maxDBSizeGB: 100,  pricePerMonth: 60   },
    { name: 'Large',  vCPUs: '2 (dedicated)', ramGB: 8,  directConns: 160, poolerConns: 800,  maxDBSizeGB: 200,  pricePerMonth: 110  },
    { name: 'XL',     vCPUs: '4 (dedicated)', ramGB: 16, directConns: 240, poolerConns: 1000, maxDBSizeGB: 500,  pricePerMonth: 210  },
    { name: '2XL',    vCPUs: '8 (dedicated)', ramGB: 32, directConns: 380, poolerConns: 1500, maxDBSizeGB: 1000, pricePerMonth: 410  },
  ],
  databaseSize: {
    proDefaultGB: 8,         // overages at $0.125/GB
    maxByTier: 'See computeTiers — Micro=10GB, Medium=100GB, XL=500GB',
    projectedYear1GB: 20,    // [ASSUMED] ~2M orders/year × ~0.5KB/row + indexes + audit log
    projectedYear3GB: 150,
    hitsWhen: '~Year 1 at 100 locations with full order/inventory/audit data',
    migrationTrigger: 'Upgrade compute tier (Small=$15/mo gets 50GB) or migrate to RDS',
  },
  directConnections: {
    microDefault: 60,
    scalesWithTier: true,
    note: 'Connections scale with compute tier. Micro=60, Small=90, Medium=120, Large=160, XL=240',
    hitsWhen: 'Almost immediately with serverless functions — MUST use pooler',
    impact: '"too many clients" errors, 503s',
    mitigation: 'MUST use Supavisor pooler (included). Our postgres.js pool of 2 is correct.',
  },
  poolerConnections: {
    microDefault: 200,
    scalesWithTier: true,
    note: 'Pooler conns scale: Micro=200, Small=400, Medium=600, Large=800, XL=1000',
    hitsWhen: 'Stage 2 (~100+ concurrent Vercel functions × 2 pool connections each)',
    impact: 'Connection errors under peak load',
    mitigation: 'Upgrade compute tier or migrate to RDS + PgBouncer',
  },
  backups: {
    proDefault: 'Daily automated, 7-day retention',
    pitr: 'Available as add-on on Pro (replaces daily when enabled)',
    teamDefault: 'Daily automated, 14-day retention + PITR available',
    note: 'PITR is available on ALL paid plans now, not just Team',
    hitsWhen: 'Financial data requires point-in-time recovery for compliance',
    migrationTrigger: 'Enable PITR add-on on Pro, or migrate to RDS (PITR included by default)',
  },
  readReplicas: {
    availableOn: 'Pro, Team, Enterprise',
    pricedPerComputeTier: true,
    note: 'Read replicas are now available on Pro — no longer Team-only',
    hitsWhen: 'Reports impact POS performance, need read/write split',
    migrationTrigger: 'Add read replica on same tier, or migrate to RDS',
  },
  bandwidth: {
    includedGB: 250,
    overagePerGB: 0.09,
    hitsWhen: 'Heavy API usage with large payloads',
    projectedStage: 'Stage 2 — depends on API payload patterns',
  },
} as const;

// ── Phase 2: Cost Curve Projection (Feb 2026 pricing) ───────────────
//
// Key correction from previous version:
// - Supabase Pro now supports read replicas and PITR add-on
// - Team ($599/mo) is for compliance (SOC2, SAML), NOT features
// - Compute tiers are independent of Pro vs Team
// - Vercel function limits are much higher than previously documented

export const COST_PROJECTIONS = [
  {
    stage: 'Launch',
    locations: 10,
    terminals: 15,
    ordersPerMonth: 5_000,
    vercelSupabase: {
      vercelPro: 20,                    // 1 seat
      supabasePro: 25,                  // Micro tier ($10 covered by credit)
      upstashRedis: 0,                  // free tier (256MB, 500K cmds/mo)
      total: 45,
      notes: 'Micro compute is fine. Free tiers cover Redis. Cheapest option.',
    },
    aws: {
      ecsFargate: 36,                   // 1 vCPU, 2GB (ARM/Graviton) 24/7
      rdsPostgres: 53,                  // db.t4g.medium ($0.072/hr)
      alb: 20,                          // base + minimal LCU
      total: 109,
      notes: 'Overkill at this scale. No Redis needed yet. Vercel is 2.4x cheaper.',
    },
    azure: {
      containerApps: 79,               // 1 vCPU, 2 GiB 24/7 (minus free grants ≈ $40)
      flexibleServer: 25,              // Burstable B2s ($24.82/mo)
      total: 104,
      notes: 'Similar to AWS. Free grants help at small scale.',
    },
    winner: 'Vercel' as const,
  },
  {
    stage: 'Stage 2',
    locations: 100,
    terminals: 200,
    ordersPerMonth: 80_000,
    vercelSupabase: {
      vercelPro: 20,
      supabasePro: 25,                  // base
      supabaseCompute: 50,              // Medium tier ($60 - $10 credit = $50)
      supabaseReadReplica: 60,          // Medium replica
      upstashRedis: 20,                 // ~10M cmds/mo
      vercelFunctionOverage: 0,         // well within 1M invocations
      total: 175,
      notes: 'No Team needed! Pro + Medium compute + read replica. Much cheaper than old estimate.',
    },
    aws: {
      ecsFargate: 72,                   // 1 vCPU, 2GB × 2 tasks (ARM)
      ecsFargateWorker: 15,             // 0.5 vCPU, 1GB worker
      rdsPostgres: 106,                 // db.t4g.medium multi-AZ ($53 × 2)
      elasticache: 80,                  // cache.t3.medium ($0.109/hr)
      alb: 25,
      cloudfront: 15,                   // Pro plan flat rate
      total: 313,
      notes: 'Vercel + Supabase is CHEAPER at this scale with new Pro features.',
    },
    azure: {
      containerApps: 160,              // 1 vCPU × 2 + worker
      flexibleServer: 130,             // General Purpose D2s_v3
      azureCache: 80,
      total: 370,
      notes: 'Similar to AWS cost profile.',
    },
    winner: 'Vercel' as const,         // CORRECTED: Vercel wins until ~200-300 locations
  },
  {
    stage: 'Stage 3',
    locations: 1_000,
    terminals: 2_000,
    ordersPerMonth: 800_000,
    vercelSupabase: {
      vercelPro: 20,
      vercelFunctionOverage: 180,       // ~1.3M invocations ($0.60/M × 300K overage)
      vercelBandwidthOverage: 0,        // within 1TB
      supabasePro: 25,
      supabaseCompute: 200,             // Large tier ($110) + replica ($110) - credit
      upstashRedis: 80,                 // ~50M cmds/mo — approaching crossover with ElastiCache
      total: 505,
      notes: 'Supabase Large compute + replica. Upstash getting expensive at volume.',
    },
    aws: {
      ecsFargate: 175,                  // 2 vCPU, 4GB × 3 tasks (ARM) + worker
      rdsPostgres: 330,                 // db.r6g.large ($0.225/hr) multi-AZ + read replica
      elasticache: 80,                  // cache.t3.medium (flat rate wins over Upstash here)
      alb: 30,
      cloudfront: 15,
      s3: 5,
      total: 635,
      notes: 'AWS is MORE expensive than Vercel+Supabase! Crossover delayed.',
    },
    azure: {
      containerApps: 350,
      flexibleServer: 260,
      azureCache: 80,
      cdn: 15,
      total: 705,
      notes: 'Azure most expensive at this tier.',
    },
    winner: 'Vercel' as const,          // Supabase Pro + compute tiers keeps Vercel competitive
  },
  {
    stage: 'Stage 4',
    locations: 5_000,
    terminals: 8_000,
    ordersPerMonth: 4_000_000,
    vercelSupabase: {
      vercelPro: 20,
      vercelFunctionOverage: 1_800,     // ~4M invocations/mo ($0.60/M × 3M overage)
      vercelBandwidthOverage: 150,      // ~2TB bandwidth ($0.15/GB × 1TB overage)
      supabasePro: 25,
      supabaseCompute: 400,             // XL ($210) + replica ($210) - credit
      upstashRedis: 200,               // or switch to ElastiCache
      total: 2_595,
      notes: 'Function invocation overages become the killer. Bandwidth costs mount.',
    },
    aws: {
      ecsFargate: 450,                  // 4 vCPU, 8GB × 4 tasks + 2 workers (ARM, Savings Plan)
      rdsPostgres: 500,                 // db.r6g.xlarge multi-AZ + 2 read replicas (Reserved)
      elasticache: 120,                 // cache.r6g.large
      alb: 40,
      cloudfront: 15,                   // Pro plan covers 10M requests
      s3: 20,
      monitoring: 50,
      total: 1_195,
      notes: 'Containers win at 5K locations. Savings Plans + Reserved reduce cost further.',
    },
    azure: {
      containerApps: 700,
      flexibleServer: 400,
      azureCache: 120,
      cdn: 15,
      monitoring: 50,
      total: 1_285,
      notes: 'Slightly more than AWS. Reserved capacity helps.',
    },
    winner: 'AWS' as const,
  },
] as const;

// ── CROSSOVER ANALYSIS (Updated Feb 2026) ───────────────────────────
//
// PREVIOUS ESTIMATE: Crossover at ~50-100 locations (Stage 2)
// CORRECTED ESTIMATE: Crossover at ~2,000-3,000 locations (Stage 3-4 boundary)
//
// Why the shift?
// 1. Supabase Pro now includes read replicas (was Team-only)
// 2. Supabase PITR is a Pro add-on (was Team-only)
// 3. Compute tiers scale independently of Pro vs Team
// 4. Vercel function limits increased dramatically (800s timeout, 4GB memory, 30K concurrent)
// 5. Supabase Team ($599/mo) is only needed for SOC2/SAML compliance
//
// THE REAL MIGRATION DRIVERS are NOT cost — they are:
// 1. Operational control (custom Postgres config, PgBouncer tuning)
// 2. Compliance requirements (SOC2 without paying $599/mo for Team)
// 3. Function invocation overages at high request volume
// 4. Vercel runtime log retention (1 day is insufficient)
// 5. Cold start elimination for POS workloads
//
// RECOMMENDATION:
// - Stay on Vercel + Supabase through Stage 3 (~1,000 locations)
// - Migrate when: compliance requires it, OR function invocation costs exceed $500/mo
// - Migrate DB first (biggest operational benefit), then workers, then API
// - Auth last (keep Supabase Auth — it works independently)

// ── Phase 3: Migration Trigger Framework ─────────────────────────────

export interface MigrationTrigger {
  id: string;
  component: 'workers' | 'database' | 'api' | 'auth' | 'cache';
  metric: string;
  threshold: string;
  howToMeasure: string;
  tryFirst: string[];
  leadTimeWeeks: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export const MIGRATION_TRIGGERS: MigrationTrigger[] = [
  {
    id: 'function-timeout',
    component: 'workers',
    metric: 'Background job duration',
    threshold: 'Any job consistently > 750s (leaving 50s buffer on 800s max)',
    howToMeasure: 'Vercel function logs: filter by duration > 750000ms. Or: SELECT max(extract(epoch from (completed_at - started_at))) FROM background_jobs WHERE completed_at > now() - interval \'24h\'',
    tryFirst: [
      'Break job into chunks with continuation tokens',
      'Use streaming for report generation',
      'Configure maxDuration on the specific function (up to 800s)',
    ],
    leadTimeWeeks: 3,
    priority: 'medium',  // lowered — 800s is generous
  },
  {
    id: 'cold-start-impact',
    component: 'api',
    metric: 'Cold start percentage of POS requests',
    threshold: '>5% of POS API requests are cold starts with >500ms added latency',
    howToMeasure: 'Structured logs: count where coldStart=true on /api/v1/orders* paths. ratio = cold / total. Track P95 vs P50 gap.',
    tryFirst: [
      'Ensure Fluid Compute is enabled (default since 2025)',
      'Keep-warm cron ping every 5 minutes to /api/health',
      'Reduce function bundle size (tree-shake, lazy imports)',
      'Vercel Provisioned Concurrency (Enterprise feature)',
    ],
    leadTimeWeeks: 3,
    priority: 'high',     // POS latency is critical for UX
  },
  {
    id: 'concurrent-ceiling',
    component: 'api',
    metric: 'Dropped/queued request rate',
    threshold: '>0.5% of requests throttled or 429d by Vercel',
    howToMeasure: 'Vercel dashboard: check "Throttled Invocations" metric. Logs: count 429 status codes.',
    tryFirst: [
      'Optimize slow endpoints (reduce execution time = faster slot release)',
      'Add CDN caching for read-heavy endpoints',
      'Request coalescing for duplicate queries',
    ],
    leadTimeWeeks: 3,
    priority: 'critical',
  },
  {
    id: 'connection-pool-exhaustion',
    component: 'database',
    metric: 'Database connection errors',
    threshold: 'Any 503 from pool exhaustion after optimizing pool size',
    howToMeasure: 'Structured logs: search for "too many clients". Supabase dashboard: pooler connection count vs limit.',
    tryFirst: [
      'Verify pool size is 2 per function instance (not higher)',
      'Ensure Supavisor transaction mode (not session mode)',
      'Upgrade Supabase compute tier for more pooler connections (Small=400, Medium=600)',
      'Ensure prepare: false is set (required for Supavisor transaction mode)',
    ],
    leadTimeWeeks: 5,
    priority: 'critical',
  },
  {
    id: 'database-size',
    component: 'database',
    metric: 'GB on disk',
    threshold: '>80% of current compute tier DB size limit',
    howToMeasure: 'Supabase dashboard → Settings → Database → Disk usage. Or: SELECT pg_database_size(current_database()) / 1024^3 AS gb;',
    tryFirst: [
      'Vacuum aggressively (reduce bloat)',
      'Archive old audit_log / event_outbox rows',
      'Upgrade compute tier (Small=50GB, Medium=100GB, Large=200GB)',
    ],
    leadTimeWeeks: 6,
    priority: 'high',
  },
  {
    id: 'cost-crossover',
    component: 'api',    // function invocations are the cost driver at scale
    metric: 'Monthly Vercel function invocation charges',
    threshold: 'Function invocation overages > $500/mo for 2 consecutive months',
    howToMeasure: 'Vercel billing dashboard: "Function Invocations" line item. Track month-over-month.',
    tryFirst: [
      'Cache read-heavy endpoints (ISR, stale-while-revalidate)',
      'Combine API calls (batch endpoints)',
      'CDN cache for catalog/menu data',
    ],
    leadTimeWeeks: 8,
    priority: 'medium',
  },
  {
    id: 'read-replica-need',
    component: 'database',
    metric: 'POS P95 latency during report generation',
    threshold: 'POS P95 > 200ms while reports are running',
    howToMeasure: 'Structured logs: percentile(durationMs, 0.95) WHERE path LIKE \'/api/v1/orders%\' AND timestamp BETWEEN report_start AND report_end.',
    tryFirst: [
      'Schedule reports during off-peak hours',
      'Add statement_timeout for report queries',
      'Add Supabase read replica on Pro (available now — priced per compute tier)',
      'Route read queries via USE_READ_REPLICA feature flag',
    ],
    leadTimeWeeks: 3,    // reduced — just add a replica on Supabase, no migration needed
    priority: 'high',
  },
  {
    id: 'outbox-dispatch-lag',
    component: 'workers',
    metric: 'Outbox dispatch latency',
    threshold: 'Oldest unpublished event consistently > 15s',
    howToMeasure: 'GET /api/admin/health → jobs.oldestAgeSecs. Or: SELECT extract(epoch from now() - min(created_at)) FROM event_outbox WHERE published_at IS NULL;',
    tryFirst: [
      'Optimize outbox worker batch size',
      'Verify in-process outbox worker is running (check instrumentation.ts)',
      'Add Vercel Cron pinging /api/v1/internal/drain-outbox every minute',
      'Deploy a tiny dedicated dispatcher on Fly.io ($5/mo)',
    ],
    leadTimeWeeks: 2,
    priority: 'high',
  },
  {
    id: 'compliance-requirement',
    component: 'database',
    metric: 'Customer/regulatory requirement',
    threshold: 'SOC2, HIPAA, or data residency required by a customer or regulation',
    howToMeasure: 'Customer contracts, legal review, insurance requirements',
    tryFirst: [
      'Supabase Team ($599/mo) includes SOC2 compliance',
      'Check if Vercel Enterprise meets the requirement',
      'If data residency: check Supabase region availability',
    ],
    leadTimeWeeks: 12,
    priority: 'medium',
  },
  {
    id: 'custom-pg-config',
    component: 'database',
    metric: 'Need to tune shared_buffers, work_mem, etc.',
    threshold: 'Performance issues solvable only with Postgres config changes unavailable on Supabase',
    howToMeasure: 'DB health checks: cache hit ratio < 95%, slow queries needing work_mem > default, or custom extensions.',
    tryFirst: [
      'Query optimization (indexes, query rewrites)',
      'Application-level caching (Redis)',
      'Contact Supabase support for config changes (they can adjust some params)',
    ],
    leadTimeWeeks: 5,
    priority: 'low',
  },
  {
    id: 'log-retention',
    component: 'api',
    metric: 'Runtime log retention need',
    threshold: 'Need >1 day of runtime logs for debugging production issues',
    howToMeasure: 'Count of times you needed to debug an issue >24h after it occurred',
    tryFirst: [
      'Ship logs to external aggregator (Axiom, Datadog, Grafana Cloud) — do this regardless',
      'Vercel Enterprise extends to 3 days (still insufficient for most needs)',
    ],
    leadTimeWeeks: 1,
    priority: 'high',    // should be done at launch, not as a migration trigger
  },
];

// ── Phase 4: Component Migration Plans ──────────────────────────────
//
// See infra/ directory for concrete artifacts:
//   infra/docker/Dockerfile.web          — Next.js production image
//   infra/docker/Dockerfile.worker       — Background worker image
//   infra/docker-compose.yml             — Production topology
//   infra/terraform/main.tf              — AWS ECS + RDS + ElastiCache
//   infra/terraform/variables.tf         — Configurable parameters
//   infra/migration/db-migration-checklist.sql — Post-migration validation
//   infra/worker.ts                      — Worker entry point
//   .github/workflows/deploy-aws.yml     — CI/CD for ECS deployment
//
// Migration order and what changes in code:
//
// 4A. DATABASE (Supabase → RDS): Change DATABASE_URL env var. That's it.
//     - Supabase Auth continues working independently
//     - RLS policies, gen_ulid(), extensions all transfer
//     - Run db-migration-checklist.sql to validate
//     - Add PgBouncer sidecar or RDS Proxy for connection pooling
//     - Can remove `prepare: false` once off Supavisor
//
// 4B. WORKERS (in-process → container): Set USE_CONTAINER_WORKERS=true
//     - Worker code already exists (infra/worker.ts)
//     - Dockerfile already exists (infra/docker/Dockerfile.worker)
//     - In-process worker stops via feature flag
//     - Container worker picks up from outbox table
//
// 4C. API (Vercel → ECS): Deploy Docker image, update DNS
//     - Dockerfile already exists (infra/docker/Dockerfile.web)
//     - Terraform already exists (infra/terraform/)
//     - CI/CD already exists (.github/workflows/deploy-aws.yml)
//     - Remove any Vercel-specific headers/env detection
//     - Update pool size (3 → 10 per container, via deployment.ts auto-detection)
//
// 4D. AUTH (Supabase Auth → self-hosted): LAST, only if forced
//     - Keep Supabase Auth as long as possible
//     - It works independently of Supabase DB
//     - Migration options: self-hosted GoTrue, NextAuth.js, Clerk
//     - Highest risk migration — breaking auth = locking out all users

export const MIGRATION_ORDER = [
  { order: 1, component: 'database',  reason: 'Biggest operational benefit, lowest code change (env var only)',  codeChange: 'DATABASE_URL env var', leadWeeks: 6 },
  { order: 2, component: 'workers',   reason: 'Enables unlimited job duration, already built',                  codeChange: 'USE_CONTAINER_WORKERS=true', leadWeeks: 2 },
  { order: 3, component: 'api',       reason: 'Eliminates cold starts, function invocation costs',              codeChange: 'DNS change, remove Vercel env detection', leadWeeks: 4 },
  { order: 4, component: 'auth',      reason: 'Only if Supabase Auth becomes limiting',                         codeChange: 'JWT verification middleware, user management', leadWeeks: 8 },
] as const;

// ── Phase 5: Migration-Ready Code (already implemented) ─────────────
//
// See:
//   packages/core/src/config/deployment.ts  — DeploymentConfig abstraction
//   packages/core/src/config/feature-flags.ts — Runtime feature flags
//
// These abstractions make migration 80% env-var-driven:
//   - deployment.ts auto-detects Vercel vs container vs local
//   - Pool size adjusts automatically per target
//   - Feature flags enable gradual rollout (read replica, Redis, container workers)

// ── Phase 6: Pre-Migration Checklist ────────────────────────────────

export const PRE_MIGRATION_CHECKLIST = [
  { item: 'Dockerfile.web exists and builds',                      status: 'done' as const, file: 'infra/docker/Dockerfile.web' },
  { item: 'Dockerfile.worker exists and builds',                   status: 'done' as const, file: 'infra/docker/Dockerfile.worker' },
  { item: 'Docker Compose for local dev (API + worker + PG + Redis)', status: 'done' as const, file: 'infra/docker-compose.yml' },
  { item: 'Environment abstraction (no Vercel-specific code)',      status: 'done' as const, file: 'packages/core/src/config/deployment.ts' },
  { item: 'DATABASE_URL is the only Supabase-specific DB config',   status: 'done' as const, file: '.env.example' },
  { item: 'Worker handlers are pure functions (not SDK-coupled)',   status: 'done' as const, file: 'infra/worker.ts' },
  { item: 'Health check endpoint covers DB + basic checks',        status: 'done' as const, file: 'apps/web/src/app/api/health/route.ts' },
  { item: 'Detailed admin health behind auth',                     status: 'done' as const, file: 'apps/web/src/app/api/admin/health/route.ts' },
  { item: 'Structured JSON logging to stdout',                     status: 'done' as const, file: 'packages/core/src/observability/logger.ts' },
  { item: 'Feature flags for gradual migration',                   status: 'done' as const, file: 'packages/core/src/config/feature-flags.ts' },
  { item: 'Terraform IaC for AWS (VPC+ECS+RDS+Redis+ALB)',        status: 'done' as const, file: 'infra/terraform/main.tf' },
  { item: 'CI/CD pipeline for ECS deployment',                     status: 'done' as const, file: '.github/workflows/deploy-aws.yml' },
  { item: 'Load test suite for performance baselines',             status: 'done' as const, file: '.github/workflows/load-test.yml' },
  { item: 'DB migration validation queries',                       status: 'done' as const, file: 'infra/migration/db-migration-checklist.sql' },
  { item: '.env.example for new dev onboarding',                   status: 'done' as const, file: '.env.example' },
  { item: 'Ship logs to external aggregator',                      status: 'todo' as const, file: null },
  { item: 'Cost tracking dashboard (know current monthly spend)',   status: 'todo' as const, file: null },
  { item: 'CI runs tests against Docker Postgres (not Supabase)',  status: 'done' as const, file: '.github/workflows/business-logic-tests.yml' },
  { item: 'Sentry error tracking configured',                      status: 'partial' as const, file: 'apps/web/sentry-config/' },
  { item: 'Rate limiting on API routes',                           status: 'todo' as const, file: null },
  { item: 'CORS configuration for production',                     status: 'todo' as const, file: null },
] as const;

// ── Print Assessment ─────────────────────────────────────────────────

function printAssessment() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   VERCEL + SUPABASE LIMITS & MIGRATION ASSESSMENT          ║');
  console.log('║   Updated: Feb 2026                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('── COST CROSSOVER SUMMARY ──\n');
  for (const stage of COST_PROJECTIONS) {
    const vs = stage.vercelSupabase as Record<string, unknown>;
    const aw = stage.aws as Record<string, unknown>;
    const v = `$${vs.total}`;
    const a = `$${aw.total}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const az = 'azure' in stage ? `$${(stage as any).azure?.total}` : 'N/A';
    console.log(`  ${stage.stage} (${stage.locations.toLocaleString()} locations):`);
    console.log(`    Vercel+Supabase: ${v}/mo | AWS: ${a}/mo | Azure: ${az}/mo → ${stage.winner}`);
  }

  console.log('\n  ⚡ Crossover at ~2,000-3,000 locations (NOT ~100 as previously estimated)');
  console.log('  ⚡ Real migration drivers: compliance, cold starts, log retention — not cost\n');

  console.log('── MIGRATION TRIGGERS (by priority) ──\n');
  const sorted = [...MIGRATION_TRIGGERS].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });
  for (const t of sorted) {
    const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[t.priority];
    console.log(`  ${icon} [${t.priority.toUpperCase()}] ${t.id} (${t.component})`);
    console.log(`     Threshold: ${t.threshold}`);
    console.log(`     Lead time: ${t.leadTimeWeeks} weeks`);
  }

  console.log('\n── MIGRATION ORDER ──\n');
  for (const m of MIGRATION_ORDER) {
    console.log(`  ${m.order}. ${m.component.toUpperCase()} — ${m.reason}`);
    console.log(`     Code change: ${m.codeChange} | Lead: ${m.leadWeeks} weeks`);
  }

  console.log('\n── PRE-MIGRATION CHECKLIST ──\n');
  const done = PRE_MIGRATION_CHECKLIST.filter(c => c.status === 'done').length;
  const total = PRE_MIGRATION_CHECKLIST.length;
  console.log(`  Progress: ${done}/${total} items complete\n`);
  for (const c of PRE_MIGRATION_CHECKLIST) {
    const icon = c.status === 'done' ? '✅' : c.status === 'partial' ? '🔶' : '⬜';
    console.log(`  ${icon} ${c.item}${c.file ? ` (${c.file})` : ''}`);
  }
}

// Run if executed directly
const isMain = typeof process !== 'undefined' && process.argv[1]?.includes('LIMITS_AND_MIGRATION');
if (isMain) printAssessment();
