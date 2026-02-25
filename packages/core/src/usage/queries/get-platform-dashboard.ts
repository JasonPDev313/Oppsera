/**
 * Platform Usage Dashboard — aggregate KPIs across all tenants.
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export interface PlatformDashboardResult {
  kpis: {
    totalRequests: number;
    activeTenants: number;
    errorRate: number;
    avgLatencyMs: number;
  };
  moduleRanking: { moduleKey: string; requestCount: number; errorCount: number; uniqueTenants: number }[];
  tenantRanking: { tenantId: string; tenantName: string; requestCount: number; lastActiveAt: string }[];
  adoptionRates: { moduleKey: string; activeTenants: number; totalTenants: number; adoptionPct: number }[];
  errorTrend: { usageDate: string; errorRate: number; requestCount: number }[];
  hourlyTraffic: { hour: number; requestCount: number }[];
}

export async function getPlatformDashboard(
  period: '1d' | '7d' | '30d' = '7d',
): Promise<PlatformDashboardResult> {
  const days = period === '1d' ? 1 : period === '7d' ? 7 : 30;

  // Run all queries in parallel
  const [kpiRows, moduleRows, tenantRows, adoptionRows, errorRows, hourlyRows] = await Promise.all([
    // ── KPIs ─────────────────────────────────────────────
    db.execute(sql`
      SELECT
        COALESCE(SUM(request_count), 0)::int AS total_requests,
        COUNT(DISTINCT tenant_id)::int AS active_tenants,
        CASE
          WHEN SUM(request_count) > 0
          THEN (SUM(error_count)::numeric / SUM(request_count) * 100)
          ELSE 0
        END AS error_rate,
        CASE
          WHEN SUM(request_count) > 0
          THEN (SUM(total_duration_ms)::numeric / SUM(request_count))
          ELSE 0
        END AS avg_latency_ms
      FROM rm_usage_daily
      WHERE usage_date >= CURRENT_DATE - ${days}::int
    `),

    // ── Top modules ──────────────────────────────────────
    db.execute(sql`
      SELECT
        module_key,
        SUM(request_count)::int AS request_count,
        SUM(error_count)::int AS error_count,
        COUNT(DISTINCT tenant_id)::int AS unique_tenants
      FROM rm_usage_daily
      WHERE usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY module_key
      ORDER BY SUM(request_count) DESC
      LIMIT 15
    `),

    // ── Top tenants ──────────────────────────────────────
    db.execute(sql`
      SELECT
        d.tenant_id,
        COALESCE(t.name, d.tenant_id) AS tenant_name,
        SUM(d.request_count)::int AS request_count,
        MAX(d.usage_date)::text AS last_active_at
      FROM rm_usage_daily d
      LEFT JOIN tenants t ON t.id = d.tenant_id
      WHERE d.usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY d.tenant_id, t.name
      ORDER BY SUM(d.request_count) DESC
      LIMIT 15
    `),

    // ── Module adoption rates ────────────────────────────
    db.execute(sql`
      SELECT
        a.module_key,
        COUNT(*) FILTER (WHERE a.is_active)::int AS active_tenants,
        (SELECT COUNT(DISTINCT tenant_id) FROM rm_usage_daily
         WHERE usage_date >= CURRENT_DATE - 30)::int AS total_tenants
      FROM rm_usage_module_adoption a
      GROUP BY a.module_key
      ORDER BY COUNT(*) FILTER (WHERE a.is_active) DESC
    `),

    // ── Error rate trend (daily, last 30d) ───────────────
    db.execute(sql`
      SELECT
        usage_date::text,
        CASE
          WHEN SUM(request_count) > 0
          THEN (SUM(error_count)::numeric / SUM(request_count) * 100)
          ELSE 0
        END AS error_rate,
        SUM(request_count)::int AS request_count
      FROM rm_usage_daily
      WHERE usage_date >= CURRENT_DATE - 30
      GROUP BY usage_date
      ORDER BY usage_date
    `),

    // ── Hourly traffic pattern (today) ───────────────────
    db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM hour_bucket)::int AS hour,
        SUM(request_count)::int AS request_count
      FROM rm_usage_hourly
      WHERE hour_bucket >= CURRENT_DATE
        AND hour_bucket < CURRENT_DATE + 1
      GROUP BY EXTRACT(HOUR FROM hour_bucket)
      ORDER BY EXTRACT(HOUR FROM hour_bucket)
    `),
  ]);

  const kpi = Array.from(kpiRows as Iterable<Record<string, unknown>>)[0] || {};

  return {
    kpis: {
      totalRequests: Number(kpi.total_requests ?? 0),
      activeTenants: Number(kpi.active_tenants ?? 0),
      errorRate: Number(Number(kpi.error_rate ?? 0).toFixed(2)),
      avgLatencyMs: Number(Number(kpi.avg_latency_ms ?? 0).toFixed(1)),
    },
    moduleRanking: Array.from(moduleRows as Iterable<Record<string, unknown>>).map((r) => ({
      moduleKey: String(r.module_key),
      requestCount: Number(r.request_count),
      errorCount: Number(r.error_count),
      uniqueTenants: Number(r.unique_tenants),
    })),
    tenantRanking: Array.from(tenantRows as Iterable<Record<string, unknown>>).map((r) => ({
      tenantId: String(r.tenant_id),
      tenantName: String(r.tenant_name),
      requestCount: Number(r.request_count),
      lastActiveAt: String(r.last_active_at),
    })),
    adoptionRates: Array.from(adoptionRows as Iterable<Record<string, unknown>>).map((r) => {
      const active = Number(r.active_tenants);
      const total = Number(r.total_tenants) || 1;
      return {
        moduleKey: String(r.module_key),
        activeTenants: active,
        totalTenants: total,
        adoptionPct: Number(((active / total) * 100).toFixed(1)),
      };
    }),
    errorTrend: Array.from(errorRows as Iterable<Record<string, unknown>>).map((r) => ({
      usageDate: String(r.usage_date),
      errorRate: Number(Number(r.error_rate ?? 0).toFixed(2)),
      requestCount: Number(r.request_count),
    })),
    hourlyTraffic: Array.from(hourlyRows as Iterable<Record<string, unknown>>).map((r) => ({
      hour: Number(r.hour),
      requestCount: Number(r.request_count),
    })),
  };
}
