import { pgTable, text, timestamp, jsonb, index, integer, numeric, bigint } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Tenant Health Snapshots ──────────────────────────────────────
// Captured every 15 minutes per active tenant. Drives the health
// grade system and the "Tenants Needing Attention" dashboard.

export const tenantHealthSnapshots = pgTable(
  'tenant_health_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

    // Activity metrics
    orders24h: integer('orders_24h').notNull().default(0),
    activeUsers24h: integer('active_users_24h').notNull().default(0),
    lastOrderAt: timestamp('last_order_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    // Error metrics
    errorCount24h: integer('error_count_24h').notNull().default(0),
    errorCount1h: integer('error_count_1h').notNull().default(0),
    dlqDepth: integer('dlq_depth').notNull().default(0),
    dlqUnresolvedOver24h: integer('dlq_unresolved_over_24h').notNull().default(0),

    // System metrics
    backgroundJobFailures24h: integer('background_job_failures_24h').notNull().default(0),
    integrationErrorCount24h: integer('integration_error_count_24h').notNull().default(0),
    avgResponseTimeMs: numeric('avg_response_time_ms', { precision: 10, scale: 2 }),
    p95ResponseTimeMs: numeric('p95_response_time_ms', { precision: 10, scale: 2 }),

    // GL / Financial health
    unpostedGlEntries: integer('unposted_gl_entries').notNull().default(0),
    unmappedGlEvents: integer('unmapped_gl_events').notNull().default(0),
    openCloseBatches: integer('open_close_batches').notNull().default(0),

    // Computed grade
    healthGrade: text('health_grade').notNull().default('A'),
    healthScore: integer('health_score').notNull().default(100),
    gradeFactors: jsonb('grade_factors').notNull().default([]),
  },
  (table) => [
    index('idx_tenant_health_snapshots_latest').on(table.tenantId, table.capturedAt),
    index('idx_tenant_health_snapshots_grade').on(table.healthGrade, table.capturedAt),
  ],
);

// ── System Metrics Snapshots ─────────────────────────────────────
// Captured alongside tenant health snapshots. Drives the system
// health dashboard sparklines and resource panels.

export const systemMetricsSnapshots = pgTable(
  'system_metrics_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

    // Global activity
    totalOrdersToday: integer('total_orders_today').notNull().default(0),
    totalOrders1h: integer('total_orders_1h').notNull().default(0),
    activeTenantsToday: integer('active_tenants_today').notNull().default(0),
    activeUsersToday: integer('active_users_today').notNull().default(0),

    // Error rates
    totalErrors1h: integer('total_errors_1h').notNull().default(0),
    totalDlqDepth: integer('total_dlq_depth').notNull().default(0),
    totalDlqUnresolved: integer('total_dlq_unresolved').notNull().default(0),

    // System resources
    dbConnectionCount: integer('db_connection_count'),
    dbMaxConnections: integer('db_max_connections'),
    dbCacheHitPct: numeric('db_cache_hit_pct', { precision: 5, scale: 2 }),
    dbSizeBytes: bigint('db_size_bytes', { mode: 'number' }),

    // Background jobs
    queuedJobs: integer('queued_jobs').notNull().default(0),
    failedJobs1h: integer('failed_jobs_1h').notNull().default(0),
    stuckConsumers: integer('stuck_consumers').notNull().default(0),

    // Tenants by grade
    tenantsGradeA: integer('tenants_grade_a').notNull().default(0),
    tenantsGradeB: integer('tenants_grade_b').notNull().default(0),
    tenantsGradeC: integer('tenants_grade_c').notNull().default(0),
    tenantsGradeD: integer('tenants_grade_d').notNull().default(0),
    tenantsGradeF: integer('tenants_grade_f').notNull().default(0),
  },
  (table) => [
    index('idx_system_metrics_snapshots_captured').on(table.capturedAt),
  ],
);
