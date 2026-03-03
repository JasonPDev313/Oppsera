import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { withAdminDb } from '@/lib/admin-db';

// ── GET /api/v1/health/dashboard — System health overview ──────────

export const GET = withAdminPermission(async (_req: NextRequest) => {
  const data = await withAdminDb(async (tx) => {
    const ts = (v: unknown) =>
      v instanceof Date ? v.toISOString() : v ? String(v) : null;

    // Latest system metrics snapshot
    const systemRows = await tx.execute(sql`
      SELECT *
      FROM system_metrics_snapshots
      ORDER BY captured_at DESC
      LIMIT 1
    `);
    const systemItems = Array.from(systemRows as Iterable<Record<string, unknown>>);
    const latestSystem = systemItems[0] ?? null;

    // Last 24 system snapshots for sparklines
    const trendRows = await tx.execute(sql`
      SELECT *
      FROM system_metrics_snapshots
      ORDER BY captured_at DESC
      LIMIT 24
    `);
    const trend = Array.from(trendRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      capturedAt: ts(r.captured_at),
      totalOrdersToday: Number(r.total_orders_today ?? 0),
      totalOrders1h: Number(r.total_orders_1h ?? 0),
      activeTenantsToday: Number(r.active_tenants_today ?? 0),
      activeUsersToday: Number(r.active_users_today ?? 0),
      totalErrors1h: Number(r.total_errors_1h ?? 0),
      totalDlqDepth: Number(r.total_dlq_depth ?? 0),
      totalDlqUnresolved: Number(r.total_dlq_unresolved ?? 0),
      dbConnectionCount: r.db_connection_count != null ? Number(r.db_connection_count) : null,
      dbMaxConnections: r.db_max_connections != null ? Number(r.db_max_connections) : null,
      dbCacheHitPct: r.db_cache_hit_pct != null ? Number(r.db_cache_hit_pct) : null,
      dbSizeBytes: r.db_size_bytes != null ? Number(r.db_size_bytes) : null,
      queuedJobs: Number(r.queued_jobs ?? 0),
      failedJobs1h: Number(r.failed_jobs_1h ?? 0),
      stuckConsumers: Number(r.stuck_consumers ?? 0),
      tenantsGradeA: Number(r.tenants_grade_a ?? 0),
      tenantsGradeB: Number(r.tenants_grade_b ?? 0),
      tenantsGradeC: Number(r.tenants_grade_c ?? 0),
      tenantsGradeD: Number(r.tenants_grade_d ?? 0),
      tenantsGradeF: Number(r.tenants_grade_f ?? 0),
    }));

    // Alerts — last 20 from alert_log
    const alertRows = await tx.execute(sql`
      SELECT id, level, title, details, tenant_id, context, sent_at, channel
      FROM alert_log
      ORDER BY sent_at DESC
      LIMIT 20
    `);
    const alerts = Array.from(alertRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      level: r.level as string,
      title: r.title as string,
      details: r.details as string | null,
      tenantId: r.tenant_id as string | null,
      context: r.context as Record<string, unknown> | null,
      sentAt: ts(r.sent_at),
      channel: r.channel as string | null,
    }));

    // Tenants by grade — from cached health_grade on tenants table
    const gradeRows = await tx.execute(sql`
      SELECT
        health_grade,
        COUNT(*)::int AS count
      FROM tenants
      WHERE status = 'active'
      GROUP BY health_grade
    `);
    const gradeItems = Array.from(gradeRows as Iterable<Record<string, unknown>>);
    const tenantsByGrade: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of gradeItems) {
      const grade = r.health_grade as string;
      if (grade in tenantsByGrade) {
        tenantsByGrade[grade] = Number(r.count ?? 0);
      }
    }

    // Top issues — latest snapshot per tenant where grade is D or F
    const issueRows = await tx.execute(sql`
      SELECT DISTINCT ON (ths.tenant_id)
        ths.tenant_id,
        t.name AS tenant_name,
        ths.health_grade AS grade,
        ths.health_score AS score,
        ths.grade_factors AS factors
      FROM tenant_health_snapshots ths
      JOIN tenants t ON t.id = ths.tenant_id
      WHERE ths.health_grade IN ('D', 'F')
      ORDER BY ths.tenant_id, ths.captured_at DESC
    `);
    const topIssues = Array.from(issueRows as Iterable<Record<string, unknown>>).map((r) => ({
      tenantId: r.tenant_id as string,
      tenantName: r.tenant_name as string,
      grade: r.grade as string,
      score: Number(r.score ?? 0),
      factors: r.factors as unknown[],
    }));

    // Format latest system snapshot
    const system = latestSystem
      ? {
          id: latestSystem.id as string,
          capturedAt: ts(latestSystem.captured_at),
          totalOrdersToday: Number(latestSystem.total_orders_today ?? 0),
          totalOrders1h: Number(latestSystem.total_orders_1h ?? 0),
          activeTenantsToday: Number(latestSystem.active_tenants_today ?? 0),
          activeUsersToday: Number(latestSystem.active_users_today ?? 0),
          totalErrors1h: Number(latestSystem.total_errors_1h ?? 0),
          totalDlqDepth: Number(latestSystem.total_dlq_depth ?? 0),
          totalDlqUnresolved: Number(latestSystem.total_dlq_unresolved ?? 0),
          dbConnectionCount: latestSystem.db_connection_count != null ? Number(latestSystem.db_connection_count) : null,
          dbMaxConnections: latestSystem.db_max_connections != null ? Number(latestSystem.db_max_connections) : null,
          dbCacheHitPct: latestSystem.db_cache_hit_pct != null ? Number(latestSystem.db_cache_hit_pct) : null,
          dbSizeBytes: latestSystem.db_size_bytes != null ? Number(latestSystem.db_size_bytes) : null,
          queuedJobs: Number(latestSystem.queued_jobs ?? 0),
          failedJobs1h: Number(latestSystem.failed_jobs_1h ?? 0),
          stuckConsumers: Number(latestSystem.stuck_consumers ?? 0),
          tenantsGradeA: Number(latestSystem.tenants_grade_a ?? 0),
          tenantsGradeB: Number(latestSystem.tenants_grade_b ?? 0),
          tenantsGradeC: Number(latestSystem.tenants_grade_c ?? 0),
          tenantsGradeD: Number(latestSystem.tenants_grade_d ?? 0),
          tenantsGradeF: Number(latestSystem.tenants_grade_f ?? 0),
        }
      : null;

    return {
      system,
      trend,
      alerts,
      tenantsByGrade,
      topIssues,
    };
  });

  return NextResponse.json({ data });
}, { permission: 'tenants.read' });
