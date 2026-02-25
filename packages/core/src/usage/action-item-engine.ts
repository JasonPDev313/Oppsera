/**
 * Action Item Engine — generates 5 types of actionable insights
 * from usage data. Idempotent by category + module + tenant.
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

interface GeneratedItem {
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  tenantId: string | null;
  moduleKey: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Run all insight generators and insert new action items.
 * Deduplicates by (category, module_key, tenant_id) — won't create
 * duplicates for the same issue.
 */
export async function generateActionItems(): Promise<{ created: number; skipped: number }> {
  const items: GeneratedItem[] = [];

  // Run all generators in parallel
  const [adoptionGaps, highErrors, staleTenants, perfDegradation, upsellOpps] = await Promise.all([
    findAdoptionGaps(),
    findHighErrorRates(),
    findStaleTenants(),
    findPerformanceDegradation(),
    findUpsellOpportunities(),
  ]);

  items.push(...adoptionGaps, ...highErrors, ...staleTenants, ...perfDegradation, ...upsellOpps);

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    // Dedup: skip if an open/reviewed item already exists for this combo
    const existing = await db.execute(sql`
      SELECT 1 FROM usage_action_items
      WHERE category = ${item.category}
        AND COALESCE(module_key, '') = COALESCE(${item.moduleKey}, '')
        AND COALESCE(tenant_id, '') = COALESCE(${item.tenantId}, '')
        AND status IN ('open', 'reviewed')
      LIMIT 1
    `);

    if (Array.from(existing as Iterable<unknown>).length > 0) {
      skipped++;
      continue;
    }

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await db.execute(sql`
      INSERT INTO usage_action_items (id, category, severity, title, description,
        tenant_id, module_key, metadata, status, expires_at, created_at, updated_at)
      VALUES (
        ${id}, ${item.category}, ${item.severity}, ${item.title}, ${item.description},
        ${item.tenantId}, ${item.moduleKey}, ${JSON.stringify(item.metadata)}::jsonb,
        'open', ${expiresAt}::timestamptz, NOW(), NOW()
      )
    `);
    created++;
  }

  return { created, skipped };
}

// ── 1. Adoption Gaps ─────────────────────────────────────────
// Modules enabled (entitlement) but unused 14+ days.
async function findAdoptionGaps(): Promise<GeneratedItem[]> {
  const rows = await db.execute(sql`
    SELECT
      e.tenant_id,
      e.module_key,
      COALESCE(t.name, e.tenant_id) AS tenant_name,
      a.last_used_at
    FROM entitlements e
    LEFT JOIN rm_usage_module_adoption a
      ON a.tenant_id = e.tenant_id AND a.module_key = e.module_key
    LEFT JOIN tenants t ON t.id = e.tenant_id
    WHERE e.access_mode IN ('view', 'full')
      AND (a.last_used_at IS NULL OR a.last_used_at < NOW() - INTERVAL '14 days')
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    category: 'adoption_gap',
    severity: 'info' as const,
    title: `${r.tenant_name}: "${r.module_key}" enabled but unused`,
    description: `Tenant "${r.tenant_name}" has module "${r.module_key}" enabled but hasn't used it in 14+ days. Consider reaching out to offer training or check if the module should be disabled.`,
    tenantId: String(r.tenant_id),
    moduleKey: String(r.module_key),
    metadata: {
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
      tenantName: String(r.tenant_name),
    },
  }));
}

// ── 2. High Error Rates ──────────────────────────────────────
// Modules with >5% error rate in the last 7 days.
async function findHighErrorRates(): Promise<GeneratedItem[]> {
  const rows = await db.execute(sql`
    SELECT
      module_key,
      SUM(request_count)::int AS request_count,
      SUM(error_count)::int AS error_count,
      (SUM(error_count)::numeric / NULLIF(SUM(request_count), 0) * 100) AS error_rate
    FROM rm_usage_daily
    WHERE usage_date >= CURRENT_DATE - 7
    GROUP BY module_key
    HAVING SUM(request_count) > 50
      AND (SUM(error_count)::numeric / NULLIF(SUM(request_count), 0) * 100) > 5
    ORDER BY error_rate DESC
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    category: 'high_error',
    severity: (Number(r.error_rate) > 15 ? 'critical' : 'warning') as 'critical' | 'warning',
    title: `High error rate on "${r.module_key}" (${Number(r.error_rate).toFixed(1)}%)`,
    description: `Module "${r.module_key}" has a ${Number(r.error_rate).toFixed(1)}% error rate over the last 7 days (${r.error_count} errors out of ${r.request_count} requests). Investigate error logs and consider adding monitoring.`,
    tenantId: null,
    moduleKey: String(r.module_key),
    metadata: {
      errorRate: Number(Number(r.error_rate).toFixed(2)),
      requestCount: Number(r.request_count),
      errorCount: Number(r.error_count),
    },
  }));
}

// ── 3. Stale Tenants ─────────────────────────────────────────
// Active tenants with no API activity in 14+ days.
async function findStaleTenants(): Promise<GeneratedItem[]> {
  const rows = await db.execute(sql`
    SELECT
      t.id AS tenant_id,
      t.name AS tenant_name,
      MAX(a.last_used_at)::text AS last_active_at
    FROM tenants t
    LEFT JOIN rm_usage_module_adoption a ON a.tenant_id = t.id
    WHERE t.is_active = true
    GROUP BY t.id, t.name
    HAVING MAX(a.last_used_at) IS NULL
      OR MAX(a.last_used_at) < NOW() - INTERVAL '14 days'
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    category: 'stale_tenant',
    severity: 'warning' as const,
    title: `Tenant "${r.tenant_name}" inactive 14+ days`,
    description: `Tenant "${r.tenant_name}" has had no API activity in the last 14 days. Last active: ${r.last_active_at || 'never'}. Consider a check-in to ensure they're not having issues.`,
    tenantId: String(r.tenant_id),
    moduleKey: null,
    metadata: {
      tenantName: String(r.tenant_name),
      lastActiveAt: r.last_active_at ? String(r.last_active_at) : null,
    },
  }));
}

// ── 4. Performance Degradation ───────────────────────────────
// Modules where avg latency increased >20% week-over-week.
async function findPerformanceDegradation(): Promise<GeneratedItem[]> {
  const rows = await db.execute(sql`
    WITH this_week AS (
      SELECT module_key,
        SUM(total_duration_ms)::numeric / NULLIF(SUM(request_count), 0) AS avg_ms
      FROM rm_usage_daily
      WHERE usage_date >= CURRENT_DATE - 7
      GROUP BY module_key
      HAVING SUM(request_count) > 100
    ),
    last_week AS (
      SELECT module_key,
        SUM(total_duration_ms)::numeric / NULLIF(SUM(request_count), 0) AS avg_ms
      FROM rm_usage_daily
      WHERE usage_date >= CURRENT_DATE - 14
        AND usage_date < CURRENT_DATE - 7
      GROUP BY module_key
      HAVING SUM(request_count) > 100
    )
    SELECT
      tw.module_key,
      tw.avg_ms AS this_week_ms,
      lw.avg_ms AS last_week_ms,
      ((tw.avg_ms - lw.avg_ms) / NULLIF(lw.avg_ms, 0) * 100) AS pct_change
    FROM this_week tw
    JOIN last_week lw ON lw.module_key = tw.module_key
    WHERE lw.avg_ms > 0
      AND ((tw.avg_ms - lw.avg_ms) / lw.avg_ms * 100) > 20
    ORDER BY pct_change DESC
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    category: 'performance_degradation',
    severity: (Number(r.pct_change) > 50 ? 'critical' : 'warning') as 'critical' | 'warning',
    title: `"${r.module_key}" latency up ${Number(r.pct_change).toFixed(0)}% week-over-week`,
    description: `Module "${r.module_key}" average latency increased from ${Number(r.last_week_ms).toFixed(0)}ms to ${Number(r.this_week_ms).toFixed(0)}ms (${Number(r.pct_change).toFixed(0)}% increase). Review recent changes and check DB query performance.`,
    tenantId: null,
    moduleKey: String(r.module_key),
    metadata: {
      thisWeekMs: Number(Number(r.this_week_ms).toFixed(0)),
      lastWeekMs: Number(Number(r.last_week_ms).toFixed(0)),
      pctChange: Number(Number(r.pct_change).toFixed(1)),
    },
  }));
}

// ── 5. Upsell Opportunities ──────────────────────────────────
// Tenants using module A but not complementary module B.
const COMPLEMENTARY_MODULES: [string, string, string][] = [
  ['catalog', 'inventory', 'Catalog without Inventory — track stock to prevent overselling'],
  ['pos_retail', 'accounting', 'Retail POS without Accounting — GL integration improves financial visibility'],
  ['pos_fnb', 'accounting', 'F&B POS without Accounting — GL integration improves financial visibility'],
  ['customers', 'reporting', 'Customer Management without Reporting — analytics drive engagement'],
  ['pos_retail', 'reporting', 'POS without Reporting — sales dashboards boost decision-making'],
];

async function findUpsellOpportunities(): Promise<GeneratedItem[]> {
  const items: GeneratedItem[] = [];

  for (const [moduleA, moduleB, reason] of COMPLEMENTARY_MODULES) {
    const rows = await db.execute(sql`
      SELECT
        a.tenant_id,
        COALESCE(t.name, a.tenant_id) AS tenant_name
      FROM rm_usage_module_adoption a
      LEFT JOIN tenants t ON t.id = a.tenant_id
      WHERE a.module_key = ${moduleA}
        AND a.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM rm_usage_module_adoption b
          WHERE b.tenant_id = a.tenant_id
            AND b.module_key = ${moduleB}
            AND b.is_active = true
        )
    `);

    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      items.push({
        category: 'upsell_opportunity',
        severity: 'info',
        title: `${r.tenant_name}: ${reason.split(' — ')[0]}`,
        description: reason,
        tenantId: String(r.tenant_id),
        moduleKey: moduleB,
        metadata: {
          usingModule: moduleA,
          missingModule: moduleB,
          tenantName: String(r.tenant_name),
        },
      });
    }
  }

  return items;
}
