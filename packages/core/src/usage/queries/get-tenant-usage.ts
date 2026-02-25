/**
 * Tenant Usage — per-tenant usage breakdown for admin tenant detail page.
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export interface TenantUsageResult {
  moduleBreakdown: { moduleKey: string; requestCount: number; errorCount: number; pct: number }[];
  dailyActivity: { usageDate: string; requestCount: number }[];
  featureAdoption: { moduleKey: string; firstUsedAt: string | null; lastUsedAt: string | null; totalRequests: number; isActive: boolean }[];
  topWorkflows: { workflowKey: string; moduleKey: string; requestCount: number }[];
}

export async function getTenantUsage(
  tenantId: string,
  period: '7d' | '30d' = '30d',
): Promise<TenantUsageResult> {
  const days = period === '7d' ? 7 : 30;

  const [moduleRows, dailyRows, adoptionRows, workflowRows] = await Promise.all([
    // ── Module breakdown (pie chart) ─────────────────────
    db.execute(sql`
      SELECT
        module_key,
        SUM(request_count)::int AS request_count,
        SUM(error_count)::int AS error_count
      FROM rm_usage_daily
      WHERE tenant_id = ${tenantId}
        AND usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY module_key
      ORDER BY SUM(request_count) DESC
    `),

    // ── Daily activity ───────────────────────────────────
    db.execute(sql`
      SELECT
        usage_date::text,
        SUM(request_count)::int AS request_count
      FROM rm_usage_daily
      WHERE tenant_id = ${tenantId}
        AND usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY usage_date
      ORDER BY usage_date
    `),

    // ── Feature adoption ─────────────────────────────────
    db.execute(sql`
      SELECT
        module_key,
        first_used_at::text,
        last_used_at::text,
        total_requests::int,
        is_active
      FROM rm_usage_module_adoption
      WHERE tenant_id = ${tenantId}
      ORDER BY total_requests DESC
    `),

    // ── Top workflows ────────────────────────────────────
    db.execute(sql`
      SELECT
        workflow_key,
        module_key,
        SUM(request_count)::int AS request_count
      FROM rm_usage_workflow_daily
      WHERE tenant_id = ${tenantId}
        AND usage_date >= CURRENT_DATE - ${days}::int
      GROUP BY workflow_key, module_key
      ORDER BY SUM(request_count) DESC
      LIMIT 20
    `),
  ]);

  const modules = Array.from(moduleRows as Iterable<Record<string, unknown>>);
  const totalRequests = modules.reduce((sum, r) => sum + Number(r.request_count), 0) || 1;

  return {
    moduleBreakdown: modules.map((r) => ({
      moduleKey: String(r.module_key),
      requestCount: Number(r.request_count),
      errorCount: Number(r.error_count),
      pct: Number(((Number(r.request_count) / totalRequests) * 100).toFixed(1)),
    })),
    dailyActivity: Array.from(dailyRows as Iterable<Record<string, unknown>>).map((r) => ({
      usageDate: String(r.usage_date),
      requestCount: Number(r.request_count),
    })),
    featureAdoption: Array.from(adoptionRows as Iterable<Record<string, unknown>>).map((r) => ({
      moduleKey: String(r.module_key),
      firstUsedAt: r.first_used_at ? String(r.first_used_at) : null,
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
      totalRequests: Number(r.total_requests),
      isActive: Boolean(r.is_active),
    })),
    topWorkflows: Array.from(workflowRows as Iterable<Record<string, unknown>>).map((r) => ({
      workflowKey: String(r.workflow_key),
      moduleKey: String(r.module_key),
      requestCount: Number(r.request_count),
    })),
  };
}
