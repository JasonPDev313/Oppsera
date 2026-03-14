/**
 * Health Scoring Engine — Session 7
 *
 * Computes per-tenant health scores by querying live tables,
 * then writes snapshots to `tenant_health_snapshots` and
 * `system_metrics_snapshots` for dashboard consumption.
 */

import { sql } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import { withAdminDb } from './admin-db';

// ── Types ──────────────────────────────────────────────────────────

export interface HealthFactor {
  key: string;
  label: string;
  points: number;
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface TenantHealthSnapshot {
  tenantId: string;
  orders24h: number;
  activeUsers24h: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  errorCount24h: number;
  errorCount1h: number;
  dlqDepth: number;
  dlqUnresolvedOver24h: number;
  backgroundJobFailures24h: number;
  integrationErrorCount24h: number;
  unpostedGlEntries: number;
  unmappedGlEvents: number;
  openCloseBatches: number;
  healthScore: number;
  healthGrade: HealthGrade;
  gradeFactors: HealthFactor[];
}

// ── Scoring Rules ──────────────────────────────────────────────────

function computeGrade(score: number): HealthGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function scoreFromMetrics(m: {
  orders24h: number;
  hasHistoricalOrders: boolean;
  errorCount1h: number;
  dlqDepth: number;
  dlqUnresolvedOver24h: number;
  unmappedGlEvents: number;
  unpostedGlEntries: number;
}): { score: number; factors: HealthFactor[] } {
  let score = 100;
  const factors: HealthFactor[] = [];

  // DLQ depth
  if (m.dlqDepth > 20) {
    score -= 25;
    factors.push({ key: 'dlq_critical', label: 'DLQ depth critical (>20)', points: -25 });
  } else if (m.dlqDepth > 5) {
    score -= 10;
    factors.push({ key: 'dlq_elevated', label: 'DLQ depth elevated (>5)', points: -10 });
  }

  // DLQ stale
  if (m.dlqUnresolvedOver24h > 0) {
    score -= 15;
    factors.push({ key: 'dlq_stale', label: 'DLQ items unresolved >24h', points: -15 });
  }

  // Error spikes
  if (m.errorCount1h > 50) {
    score -= 20;
    factors.push({ key: 'error_spike', label: 'Error spike (>50/hr)', points: -20 });
  } else if (m.errorCount1h > 10) {
    score -= 10;
    factors.push({ key: 'error_elevated', label: 'Errors elevated (>10/hr)', points: -10 });
  }

  // GL unmapped
  if (m.unmappedGlEvents > 0) {
    score -= 10;
    factors.push({ key: 'gl_unmapped', label: 'Unmapped GL events', points: -10 });
  }

  // GL unposted
  if (m.unpostedGlEntries > 5) {
    score -= 10;
    factors.push({ key: 'gl_unposted', label: 'Unposted GL entries (>5)', points: -10 });
  }

  // Inactive tenant
  if (m.orders24h === 0 && m.hasHistoricalOrders) {
    score -= 5;
    factors.push({ key: 'inactive', label: 'No orders in 24h', points: -5 });
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  return { score, factors };
}

// ── Per-Tenant Health Capture ──────────────────────────────────────

export async function computeTenantHealth(
  tx: Database,
  tenantId: string,
): Promise<TenantHealthSnapshot> {
  // Run all metric queries in parallel
  const [
    orderMetrics,
    userMetrics,
    errorMetrics,
    dlqMetrics,
    glMetrics,
    closeBatchMetrics,
  ] = await Promise.all([
    // Orders 24h + last order + historical check
    tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS orders_24h,
        MAX(created_at) AS last_order_at,
        (COUNT(*) > 0)::boolean AS has_historical_orders
      FROM orders
      WHERE tenant_id = ${tenantId}
    `),

    // Active users 24h + last login
    tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '24 hours')::int AS active_users_24h,
        MAX(last_login_at) AS last_login_at
      FROM users
      WHERE tenant_id = ${tenantId}
        AND status = 'active'
    `),

    // Errors 1h and 24h from request_log
    tx.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status_code >= 500
          AND created_at > NOW() - INTERVAL '1 hour'
        )::int AS error_count_1h,
        COUNT(*) FILTER (
          WHERE status_code >= 500
          AND created_at > NOW() - INTERVAL '24 hours'
        )::int AS error_count_24h
      FROM request_log
      WHERE tenant_id = ${tenantId}
    `),

    // DLQ depth + stale
    tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed')::int AS dlq_depth,
        COUNT(*) FILTER (
          WHERE status = 'failed'
          AND first_failed_at < NOW() - INTERVAL '24 hours'
        )::int AS dlq_unresolved_over_24h
      FROM event_dead_letters
      WHERE tenant_id = ${tenantId}
    `),

    // GL: unposted entries + unmapped events
    tx.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM gl_journal_entries
         WHERE tenant_id = ${tenantId} AND status = 'draft') AS unposted_gl_entries,
        (SELECT COUNT(*)::int FROM gl_unmapped_events
         WHERE tenant_id = ${tenantId} AND resolved_at IS NULL) AS unmapped_gl_events
    `),

    // Close batches still open from prior days
    tx.execute(sql`
      SELECT (
        (SELECT COUNT(*)::int FROM fnb_close_batches
         WHERE tenant_id = ${tenantId}
           AND status = 'open'
           AND business_date < CURRENT_DATE)
        +
        (SELECT COUNT(*)::int FROM retail_close_batches
         WHERE tenant_id = ${tenantId}
           AND status = 'open'
           AND business_date < CURRENT_DATE)
      ) AS open_close_batches
    `),
  ]);

  // Extract values safely
  const oRow = Array.from(orderMetrics as Iterable<Record<string, unknown>>)[0] ?? {};
  const uRow = Array.from(userMetrics as Iterable<Record<string, unknown>>)[0] ?? {};
  const eRow = Array.from(errorMetrics as Iterable<Record<string, unknown>>)[0] ?? {};
  const dRow = Array.from(dlqMetrics as Iterable<Record<string, unknown>>)[0] ?? {};
  const gRow = Array.from(glMetrics as Iterable<Record<string, unknown>>)[0] ?? {};
  const cRow = Array.from(closeBatchMetrics as Iterable<Record<string, unknown>>)[0] ?? {};

  const orders24h = Number(oRow.orders_24h ?? 0);
  const hasHistoricalOrders = oRow.has_historical_orders === true;
  const lastOrderAt = oRow.last_order_at instanceof Date ? oRow.last_order_at.toISOString() : null;

  const activeUsers24h = Number(uRow.active_users_24h ?? 0);
  const lastLoginAt = uRow.last_login_at instanceof Date ? uRow.last_login_at.toISOString() : null;

  const errorCount1h = Number(eRow.error_count_1h ?? 0);
  const errorCount24h = Number(eRow.error_count_24h ?? 0);

  const dlqDepth = Number(dRow.dlq_depth ?? 0);
  const dlqUnresolvedOver24h = Number(dRow.dlq_unresolved_over_24h ?? 0);

  const unpostedGlEntries = Number(gRow.unposted_gl_entries ?? 0);
  const unmappedGlEvents = Number(gRow.unmapped_gl_events ?? 0);

  const openCloseBatches = Number(cRow.open_close_batches ?? 0);

  // Compute score
  const { score, factors } = scoreFromMetrics({
    orders24h,
    hasHistoricalOrders,
    errorCount1h,
    dlqDepth,
    dlqUnresolvedOver24h,
    unmappedGlEvents,
    unpostedGlEntries,
  });

  return {
    tenantId,
    orders24h,
    activeUsers24h,
    lastOrderAt,
    lastLoginAt,
    errorCount24h,
    errorCount1h,
    dlqDepth,
    dlqUnresolvedOver24h,
    backgroundJobFailures24h: 0, // No background_jobs table yet
    integrationErrorCount24h: 0, // No integration error tracking yet
    unpostedGlEntries,
    unmappedGlEvents,
    openCloseBatches,
    healthScore: score,
    healthGrade: computeGrade(score),
    gradeFactors: factors,
  };
}

// ── Capture All Tenants ────────────────────────────────────────────

export async function captureAllTenantHealthSnapshots(): Promise<number> {
  return withAdminDb(async (tx) => {
    // Get all active tenants
    const tenantRows = await tx.execute(sql`
      SELECT id FROM tenants WHERE status = 'active'
    `);
    const tenantIds = Array.from(tenantRows as Iterable<Record<string, unknown>>)
      .map((r) => r.id as string);

    let insertedCount = 0;

    for (const tenantId of tenantIds) {
      try {
        const snapshot = await computeTenantHealth(tx, tenantId);

        await tx.execute(sql`
          INSERT INTO tenant_health_snapshots (
            tenant_id, captured_at,
            orders_24h, active_users_24h, last_order_at, last_login_at,
            error_count_24h, error_count_1h,
            dlq_depth, dlq_unresolved_over_24h,
            background_job_failures_24h, integration_error_count_24h,
            unposted_gl_entries, unmapped_gl_events, open_close_batches,
            health_score, health_grade, grade_factors
          ) VALUES (
            ${snapshot.tenantId}, NOW(),
            ${snapshot.orders24h}, ${snapshot.activeUsers24h},
            ${snapshot.lastOrderAt ? sql`${snapshot.lastOrderAt}::timestamptz` : sql`NULL`},
            ${snapshot.lastLoginAt ? sql`${snapshot.lastLoginAt}::timestamptz` : sql`NULL`},
            ${snapshot.errorCount24h}, ${snapshot.errorCount1h},
            ${snapshot.dlqDepth}, ${snapshot.dlqUnresolvedOver24h},
            ${snapshot.backgroundJobFailures24h}, ${snapshot.integrationErrorCount24h},
            ${snapshot.unpostedGlEntries}, ${snapshot.unmappedGlEvents},
            ${snapshot.openCloseBatches},
            ${snapshot.healthScore}, ${snapshot.healthGrade},
            ${JSON.stringify(snapshot.gradeFactors)}::jsonb
          )
        `);

        // Update tenant's cached health_grade + last_activity_at (orders OR logins)
        await tx.execute(sql`
          UPDATE tenants
          SET health_grade = ${snapshot.healthGrade},
              last_activity_at = GREATEST(
                last_activity_at,
                CASE WHEN ${snapshot.orders24h} > 0 THEN NOW() ELSE NULL END,
                (SELECT MAX(created_at) FROM login_records WHERE tenant_id = ${tenantId} AND outcome = 'success')
              ),
              updated_at = NOW()
          WHERE id = ${tenantId}
        `);

        insertedCount++;
      } catch (err) {
        console.error(`[health-scoring] Failed to capture health for tenant ${tenantId}:`, err);
        // Continue with other tenants
      }
    }

    return insertedCount;
  });
}

// ── System Metrics Capture ─────────────────────────────────────────

export async function captureSystemMetrics(): Promise<void> {
  await withAdminDb(async (tx) => {
    // Global order counts
    const orderStats = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > CURRENT_DATE)::int AS total_orders_today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS total_orders_1h
      FROM orders
    `);
    const oRow = Array.from(orderStats as Iterable<Record<string, unknown>>)[0] ?? {};

    // Active tenants + users today
    const activityStats = await tx.execute(sql`
      SELECT
        (SELECT COUNT(DISTINCT tenant_id)::int FROM orders WHERE created_at > CURRENT_DATE) AS active_tenants_today,
        (SELECT COUNT(*)::int FROM users WHERE last_login_at > CURRENT_DATE AND status = 'active') AS active_users_today
    `);
    const aRow = Array.from(activityStats as Iterable<Record<string, unknown>>)[0] ?? {};

    // Error rates
    const errorStats = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_errors_1h
      FROM request_log
      WHERE status_code >= 500
        AND created_at > NOW() - INTERVAL '1 hour'
    `);
    const eRow = Array.from(errorStats as Iterable<Record<string, unknown>>)[0] ?? {};

    // DLQ totals
    const dlqStats = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed')::int AS total_dlq_depth,
        COUNT(*) FILTER (
          WHERE status = 'failed'
          AND first_failed_at < NOW() - INTERVAL '24 hours'
        )::int AS total_dlq_unresolved
      FROM event_dead_letters
    `);
    const dRow = Array.from(dlqStats as Iterable<Record<string, unknown>>)[0] ?? {};

    // DB resource stats
    const dbStats = await tx.execute(sql`
      SELECT
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS db_connection_count,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS db_max_connections,
        (SELECT
          ROUND(
            SUM(blks_hit)::numeric / NULLIF(SUM(blks_hit) + SUM(blks_read), 0) * 100, 2
          )
         FROM pg_stat_database WHERE datname = current_database()
        ) AS db_cache_hit_pct,
        (SELECT pg_database_size(current_database())) AS db_size_bytes
    `);
    const dbRow = Array.from(dbStats as Iterable<Record<string, unknown>>)[0] ?? {};

    // Tenants by grade (from cached health_grade on tenants table)
    const gradeStats = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE health_grade = 'A')::int AS tenants_grade_a,
        COUNT(*) FILTER (WHERE health_grade = 'B')::int AS tenants_grade_b,
        COUNT(*) FILTER (WHERE health_grade = 'C')::int AS tenants_grade_c,
        COUNT(*) FILTER (WHERE health_grade = 'D')::int AS tenants_grade_d,
        COUNT(*) FILTER (WHERE health_grade = 'F')::int AS tenants_grade_f
      FROM tenants
      WHERE status = 'active'
    `);
    const gRow = Array.from(gradeStats as Iterable<Record<string, unknown>>)[0] ?? {};

    await tx.execute(sql`
      INSERT INTO system_metrics_snapshots (
        captured_at,
        total_orders_today, total_orders_1h,
        active_tenants_today, active_users_today,
        total_errors_1h, total_dlq_depth, total_dlq_unresolved,
        db_connection_count, db_max_connections, db_cache_hit_pct, db_size_bytes,
        queued_jobs, failed_jobs_1h, stuck_consumers,
        tenants_grade_a, tenants_grade_b, tenants_grade_c, tenants_grade_d, tenants_grade_f
      ) VALUES (
        NOW(),
        ${Number(oRow.total_orders_today ?? 0)}, ${Number(oRow.total_orders_1h ?? 0)},
        ${Number(aRow.active_tenants_today ?? 0)}, ${Number(aRow.active_users_today ?? 0)},
        ${Number(eRow.total_errors_1h ?? 0)},
        ${Number(dRow.total_dlq_depth ?? 0)}, ${Number(dRow.total_dlq_unresolved ?? 0)},
        ${Number(dbRow.db_connection_count ?? 0)}, ${Number(dbRow.db_max_connections ?? 0)},
        ${dbRow.db_cache_hit_pct != null ? Number(dbRow.db_cache_hit_pct) : sql`NULL`},
        ${dbRow.db_size_bytes != null ? Number(dbRow.db_size_bytes) : sql`NULL`},
        0, 0, 0,
        ${Number(gRow.tenants_grade_a ?? 0)}, ${Number(gRow.tenants_grade_b ?? 0)},
        ${Number(gRow.tenants_grade_c ?? 0)}, ${Number(gRow.tenants_grade_d ?? 0)},
        ${Number(gRow.tenants_grade_f ?? 0)}
      )
    `);
  });
}

// ── Cleanup ────────────────────────────────────────────────────────

export async function cleanupOldSnapshots(): Promise<{ tenantDeleted: number; systemDeleted: number }> {
  return withAdminDb(async (tx) => {
    const tenantResult = await tx.execute(sql`
      DELETE FROM tenant_health_snapshots
      WHERE captured_at < NOW() - INTERVAL '30 days'
    `);
    const tenantDeleted = Array.from(tenantResult as Iterable<unknown>).length;

    const systemResult = await tx.execute(sql`
      DELETE FROM system_metrics_snapshots
      WHERE captured_at < NOW() - INTERVAL '30 days'
    `);
    const systemDeleted = Array.from(systemResult as Iterable<unknown>).length;

    return { tenantDeleted, systemDeleted };
  });
}
