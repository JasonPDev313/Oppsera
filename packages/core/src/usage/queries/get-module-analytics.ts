/**
 * Module Analytics — deep-dive into a single module's usage.
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { getWorkflowInfo } from '../workflow-registry';

export interface ModuleAnalyticsResult {
  kpis: {
    totalRequests: number;
    uniqueTenants: number;
    uniqueUsers: number;
    avgLatencyMs: number;
    errorRate: number;
  };
  dailyUsage: { usageDate: string; requestCount: number; errorCount: number }[];
  topWorkflows: { workflowKey: string; workflowName: string; requestCount: number; errorCount: number; uniqueUsers: number }[];
  topTenants: { tenantId: string; tenantName: string; requestCount: number }[];
}

export async function getModuleAnalytics(
  moduleKey: string,
  period: '7d' | '30d' = '30d',
): Promise<ModuleAnalyticsResult> {
  const days = period === '7d' ? 7 : 30;

  const [kpiRows, dailyRows, workflowRows, tenantRows] = await Promise.all([
    // ── KPIs ─────────────────────────────────────────────
    db.execute(sql`
      SELECT
        COALESCE(SUM(request_count), 0)::int AS total_requests,
        COUNT(DISTINCT tenant_id)::int AS unique_tenants,
        MAX(unique_users)::int AS unique_users,
        CASE WHEN SUM(request_count) > 0
          THEN (SUM(total_duration_ms)::numeric / SUM(request_count))
          ELSE 0 END AS avg_latency_ms,
        CASE WHEN SUM(request_count) > 0
          THEN (SUM(error_count)::numeric / SUM(request_count) * 100)
          ELSE 0 END AS error_rate
      FROM rm_usage_daily
      WHERE module_key = ${moduleKey}
        AND usage_date >= CURRENT_DATE - ${days}::int
    `),

    // ── Daily series ─────────────────────────────────────
    db.execute(sql`
      SELECT
        usage_date::text,
        SUM(request_count)::int AS request_count,
        SUM(error_count)::int AS error_count
      FROM rm_usage_daily
      WHERE module_key = ${moduleKey}
        AND usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY usage_date
      ORDER BY usage_date
    `),

    // ── Top workflows ────────────────────────────────────
    db.execute(sql`
      SELECT
        workflow_key,
        SUM(request_count)::int AS request_count,
        SUM(error_count)::int AS error_count,
        MAX(unique_users)::int AS unique_users
      FROM rm_usage_workflow_daily
      WHERE module_key = ${moduleKey}
        AND usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY workflow_key
      ORDER BY SUM(request_count) DESC
      LIMIT 20
    `),

    // ── Top tenants for this module ──────────────────────
    db.execute(sql`
      SELECT
        d.tenant_id,
        COALESCE(t.name, d.tenant_id) AS tenant_name,
        SUM(d.request_count)::int AS request_count
      FROM rm_usage_daily d
      LEFT JOIN tenants t ON t.id = d.tenant_id
      WHERE d.module_key = ${moduleKey}
        AND d.usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY d.tenant_id, t.name
      ORDER BY SUM(d.request_count) DESC
      LIMIT 15
    `),
  ]);

  const kpi = Array.from(kpiRows as Iterable<Record<string, unknown>>)[0] || {};

  return {
    kpis: {
      totalRequests: Number(kpi.total_requests ?? 0),
      uniqueTenants: Number(kpi.unique_tenants ?? 0),
      uniqueUsers: Number(kpi.unique_users ?? 0),
      avgLatencyMs: Number(Number(kpi.avg_latency_ms ?? 0).toFixed(1)),
      errorRate: Number(Number(kpi.error_rate ?? 0).toFixed(2)),
    },
    dailyUsage: Array.from(dailyRows as Iterable<Record<string, unknown>>).map((r) => ({
      usageDate: String(r.usage_date),
      requestCount: Number(r.request_count),
      errorCount: Number(r.error_count),
    })),
    topWorkflows: Array.from(workflowRows as Iterable<Record<string, unknown>>).map((r) => {
      const wk = String(r.workflow_key);
      const info = getWorkflowInfo(wk);
      return {
        workflowKey: wk,
        workflowName: info?.name || wk,
        requestCount: Number(r.request_count),
        errorCount: Number(r.error_count),
        uniqueUsers: Number(r.unique_users),
      };
    }),
    topTenants: Array.from(tenantRows as Iterable<Record<string, unknown>>).map((r) => ({
      tenantId: String(r.tenant_id),
      tenantName: String(r.tenant_name),
      requestCount: Number(r.request_count),
    })),
  };
}
