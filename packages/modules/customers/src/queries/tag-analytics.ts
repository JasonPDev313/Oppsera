/**
 * Tag Analytics Query Service
 *
 * Four analytics queries for the Tag Analytics Dashboard:
 * - Population trends (daily counts per tag over time)
 * - Overlap matrix (tag co-occurrence with redundancy detection)
 * - Tag effectiveness (tagged vs untagged business outcomes)
 * - Tag health (stale rules, empty tags, failure rates)
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TagPopulationTrendsInput {
  tenantId: string;
  tagIds?: string[];
  days?: number; // default 30
}

export interface TagPopulationPoint {
  date: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  count: number;
}

export interface TagPopulationTrendsResult {
  trends: TagPopulationPoint[];
  summary: {
    tagId: string;
    tagName: string;
    tagColor: string;
    currentCount: number;
    previousCount: number;
    changePercent: number;
  }[];
}

export interface TagOverlapEntry {
  tagIdA: string;
  tagNameA: string;
  tagIdB: string;
  tagNameB: string;
  overlapCount: number;
  countA: number;
  countB: number;
  overlapPercentA: number; // overlap / countA
  overlapPercentB: number; // overlap / countB
  isRedundant: boolean; // either overlap% > 80%
}

export interface TagOverlapMatrixResult {
  overlaps: TagOverlapEntry[];
  redundantPairs: number;
}

export interface TagEffectivenessInput {
  tenantId: string;
  tagId: string;
}

export interface TagEffectivenessResult {
  tagId: string;
  tagName: string;
  taggedCount: number;
  untaggedCount: number;
  taggedAvgSpend: number;
  untaggedAvgSpend: number;
  taggedAvgVisits: number;
  untaggedAvgVisits: number;
  taggedRetentionRate: number; // % with activity in last 90 days
  untaggedRetentionRate: number;
  spendLift: number; // % improvement
  visitLift: number;
}

export interface TagHealthItem {
  type: 'stale_rule' | 'empty_tag' | 'high_skip_rate' | 'high_failure_rate' | 'no_actions';
  severity: 'warning' | 'error' | 'info';
  tagId: string;
  tagName: string;
  ruleId?: string;
  ruleName?: string;
  detail: string;
  value?: number;
}

export interface TagHealthResult {
  items: TagHealthItem[];
  overallScore: number; // 0-100, 100 = perfect
  totalTags: number;
  activeTags: number;
  totalRules: number;
  activeRules: number;
  recentActivity: {
    action: string;
    count: number;
  }[];
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Daily population counts per tag over a time window.
 * Uses the tag_audit_log to compute daily snapshots.
 */
export async function getTagPopulationTrends(
  input: TagPopulationTrendsInput,
): Promise<TagPopulationTrendsResult> {
  const days = Math.min(input.days ?? 30, 365);

  return withTenant(input.tenantId, async (tx) => {
    // Build tag filter clause
    const tagFilter = input.tagIds?.length
      ? sql`AND t.id = ANY(${input.tagIds})`
      : sql``;

    // Get daily counts using date_trunc on audit log
    const trendRows = await tx.execute(sql`
      WITH date_range AS (
        SELECT generate_series(
          (CURRENT_DATE - ${days}::int)::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS d
      ),
      active_tags AS (
        SELECT t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
        FROM tags t
        WHERE t.tenant_id = ${input.tenantId}
          AND t.archived_at IS NULL
          AND t.is_active = true
          ${tagFilter}
      ),
      daily_counts AS (
        SELECT
          dr.d AS date,
          at.tag_id,
          at.tag_name,
          at.tag_color,
          (
            SELECT COUNT(*)::int
            FROM customer_tags ct
            WHERE ct.tenant_id = ${input.tenantId}
              AND ct.tag_id = at.tag_id
              AND ct.applied_at::date <= dr.d
              AND (ct.removed_at IS NULL OR ct.removed_at::date > dr.d)
          ) AS count
        FROM date_range dr
        CROSS JOIN active_tags at
      )
      SELECT date, tag_id, tag_name, tag_color, count
      FROM daily_counts
      ORDER BY date, tag_name
    `);

    const trends: TagPopulationPoint[] = (trendRows as any[]).map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0]! : String(r.date),
      tagId: r.tag_id,
      tagName: r.tag_name,
      tagColor: r.tag_color,
      count: Number(r.count),
    }));

    // Compute summary: current vs period-start
    const summaryMap = new Map<string, {
      tagId: string; tagName: string; tagColor: string; currentCount: number; previousCount: number;
    }>();

    for (const point of trends) {
      const existing = summaryMap.get(point.tagId);
      if (!existing) {
        summaryMap.set(point.tagId, {
          tagId: point.tagId,
          tagName: point.tagName,
          tagColor: point.tagColor,
          currentCount: point.count,
          previousCount: point.count,
        });
      } else {
        // First point = oldest = previousCount. Last point = latest = currentCount.
        existing.currentCount = point.count;
      }
    }

    const summary = Array.from(summaryMap.values()).map((s) => ({
      ...s,
      changePercent: s.previousCount > 0
        ? Math.round(((s.currentCount - s.previousCount) / s.previousCount) * 100)
        : s.currentCount > 0 ? 100 : 0,
    }));

    return { trends, summary };
  });
}

/**
 * Tag overlap matrix — finds customers who have multiple tags simultaneously.
 * Flags pairs with >80% overlap as potentially redundant.
 */
export async function getTagOverlapMatrix(
  tenantId: string,
): Promise<TagOverlapMatrixResult> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      WITH active_assignments AS (
        SELECT ct.customer_id, ct.tag_id, t.name AS tag_name
        FROM customer_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.tenant_id = ${tenantId}
          AND ct.removed_at IS NULL
          AND t.archived_at IS NULL
          AND t.is_active = true
      ),
      tag_counts AS (
        SELECT tag_id, COUNT(DISTINCT customer_id)::int AS cnt
        FROM active_assignments
        GROUP BY tag_id
      ),
      overlap_pairs AS (
        SELECT
          a.tag_id AS tag_id_a,
          a.tag_name AS tag_name_a,
          b.tag_id AS tag_id_b,
          b.tag_name AS tag_name_b,
          COUNT(DISTINCT a.customer_id)::int AS overlap_count
        FROM active_assignments a
        JOIN active_assignments b
          ON a.customer_id = b.customer_id
          AND a.tag_id < b.tag_id
        GROUP BY a.tag_id, a.tag_name, b.tag_id, b.tag_name
        HAVING COUNT(DISTINCT a.customer_id) > 0
      )
      SELECT
        op.tag_id_a, op.tag_name_a,
        op.tag_id_b, op.tag_name_b,
        op.overlap_count,
        COALESCE(ca.cnt, 0) AS count_a,
        COALESCE(cb.cnt, 0) AS count_b
      FROM overlap_pairs op
      LEFT JOIN tag_counts ca ON ca.tag_id = op.tag_id_a
      LEFT JOIN tag_counts cb ON cb.tag_id = op.tag_id_b
      ORDER BY op.overlap_count DESC
      LIMIT 50
    `);

    const overlaps: TagOverlapEntry[] = (rows as any[]).map((r) => {
      const countA = Number(r.count_a) || 1;
      const countB = Number(r.count_b) || 1;
      const overlapCount = Number(r.overlap_count);
      const overlapPercentA = Math.round((overlapCount / countA) * 100);
      const overlapPercentB = Math.round((overlapCount / countB) * 100);

      return {
        tagIdA: r.tag_id_a,
        tagNameA: r.tag_name_a,
        tagIdB: r.tag_id_b,
        tagNameB: r.tag_name_b,
        overlapCount,
        countA,
        countB,
        overlapPercentA,
        overlapPercentB,
        isRedundant: overlapPercentA > 80 || overlapPercentB > 80,
      };
    });

    return {
      overlaps,
      redundantPairs: overlaps.filter((o) => o.isRedundant).length,
    };
  });
}

/**
 * Tag effectiveness — compares business outcomes for tagged vs untagged customers.
 * Uses customer_metrics_lifetime for spend/visit comparisons.
 */
export async function getTagEffectiveness(
  input: TagEffectivenessInput,
): Promise<TagEffectivenessResult> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      WITH tag_info AS (
        SELECT id, name FROM tags
        WHERE id = ${input.tagId}
          AND tenant_id = ${input.tenantId}
        LIMIT 1
      ),
      tagged_customers AS (
        SELECT DISTINCT ct.customer_id
        FROM customer_tags ct
        WHERE ct.tenant_id = ${input.tenantId}
          AND ct.tag_id = ${input.tagId}
          AND ct.removed_at IS NULL
      ),
      tagged_stats AS (
        SELECT
          COUNT(DISTINCT c.id)::int AS count,
          COALESCE(AVG(COALESCE(cml.total_spend, 0)), 0)::numeric(12,2) AS avg_spend,
          COALESCE(AVG(COALESCE(cml.total_visits, 0)), 0)::numeric(12,2) AS avg_visits,
          CASE
            WHEN COUNT(c.id) = 0 THEN 0
            ELSE (
              COUNT(DISTINCT CASE
                WHEN cml.last_visit_at >= CURRENT_DATE - INTERVAL '90 days' THEN c.id
              END)::float / NULLIF(COUNT(DISTINCT c.id), 0) * 100
            )::numeric(5,1)
          END AS retention_rate
        FROM tagged_customers tc
        JOIN customers c ON c.id = tc.customer_id
        LEFT JOIN customer_metrics_lifetime cml
          ON cml.customer_id = c.id AND cml.tenant_id = ${input.tenantId}
      ),
      untagged_stats AS (
        SELECT
          COUNT(DISTINCT c.id)::int AS count,
          COALESCE(AVG(COALESCE(cml.total_spend, 0)), 0)::numeric(12,2) AS avg_spend,
          COALESCE(AVG(COALESCE(cml.total_visits, 0)), 0)::numeric(12,2) AS avg_visits,
          CASE
            WHEN COUNT(c.id) = 0 THEN 0
            ELSE (
              COUNT(DISTINCT CASE
                WHEN cml.last_visit_at >= CURRENT_DATE - INTERVAL '90 days' THEN c.id
              END)::float / NULLIF(COUNT(DISTINCT c.id), 0) * 100
            )::numeric(5,1)
          END AS retention_rate
        FROM customers c
        LEFT JOIN customer_metrics_lifetime cml
          ON cml.customer_id = c.id AND cml.tenant_id = ${input.tenantId}
        WHERE c.tenant_id = ${input.tenantId}
          AND c.id NOT IN (SELECT customer_id FROM tagged_customers)
      )
      SELECT
        ti.id AS tag_id,
        ti.name AS tag_name,
        ts.count AS tagged_count,
        us.count AS untagged_count,
        ts.avg_spend AS tagged_avg_spend,
        us.avg_spend AS untagged_avg_spend,
        ts.avg_visits AS tagged_avg_visits,
        us.avg_visits AS untagged_avg_visits,
        ts.retention_rate AS tagged_retention,
        us.retention_rate AS untagged_retention
      FROM tag_info ti
      CROSS JOIN tagged_stats ts
      CROSS JOIN untagged_stats us
    `);

    const row = (rows as any[])[0];
    if (!row) {
      return {
        tagId: input.tagId,
        tagName: 'Unknown',
        taggedCount: 0,
        untaggedCount: 0,
        taggedAvgSpend: 0,
        untaggedAvgSpend: 0,
        taggedAvgVisits: 0,
        untaggedAvgVisits: 0,
        taggedRetentionRate: 0,
        untaggedRetentionRate: 0,
        spendLift: 0,
        visitLift: 0,
      };
    }

    const taggedAvgSpend = Number(row.tagged_avg_spend);
    const untaggedAvgSpend = Number(row.untagged_avg_spend);
    const taggedAvgVisits = Number(row.tagged_avg_visits);
    const untaggedAvgVisits = Number(row.untagged_avg_visits);

    return {
      tagId: row.tag_id,
      tagName: row.tag_name,
      taggedCount: Number(row.tagged_count),
      untaggedCount: Number(row.untagged_count),
      taggedAvgSpend,
      untaggedAvgSpend,
      taggedAvgVisits,
      untaggedAvgVisits,
      taggedRetentionRate: Number(row.tagged_retention),
      untaggedRetentionRate: Number(row.untagged_retention),
      spendLift: untaggedAvgSpend > 0
        ? Math.round(((taggedAvgSpend - untaggedAvgSpend) / untaggedAvgSpend) * 100)
        : 0,
      visitLift: untaggedAvgVisits > 0
        ? Math.round(((taggedAvgVisits - untaggedAvgVisits) / untaggedAvgVisits) * 100)
        : 0,
    };
  });
}

/**
 * Tag health — returns actionable health items for the tag system.
 * Detects stale rules, empty tags, high skip/failure rates, and missing actions.
 */
export async function getTagHealth(tenantId: string): Promise<TagHealthResult> {
  return withTenant(tenantId, async (tx) => {
    const items: TagHealthItem[] = [];

    // Get tag + rule counts
    const [tagStats] = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_tags,
        COUNT(*) FILTER (WHERE is_active = true AND archived_at IS NULL)::int AS active_tags
      FROM tags
      WHERE tenant_id = ${tenantId}
    `) as any[];

    const [ruleStats] = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_rules,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active_rules
      FROM smart_tag_rules
      WHERE tenant_id = ${tenantId}
    `) as any[];

    // 1. Stale rules: active but not evaluated in 7+ days
    const staleRules = await tx.execute(sql`
      SELECT r.id, r.name, r.tag_id, t.name AS tag_name,
             r.last_evaluated_at
      FROM smart_tag_rules r
      JOIN tags t ON t.id = r.tag_id
      WHERE r.tenant_id = ${tenantId}
        AND r.is_active = true
        AND (
          r.last_evaluated_at IS NULL
          OR r.last_evaluated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
        )
      LIMIT 20
    `);

    for (const r of staleRules as any[]) {
      items.push({
        type: 'stale_rule',
        severity: r.last_evaluated_at === null ? 'error' : 'warning',
        tagId: r.tag_id,
        tagName: r.tag_name,
        ruleId: r.id,
        ruleName: r.name,
        detail: r.last_evaluated_at === null
          ? 'Rule has never been evaluated'
          : `Last evaluated ${Math.floor((Date.now() - new Date(r.last_evaluated_at).getTime()) / 86400000)}d ago`,
      });
    }

    // 2. Empty tags: active tags with 0 customers
    const emptyTags = await tx.execute(sql`
      SELECT id, name
      FROM tags
      WHERE tenant_id = ${tenantId}
        AND is_active = true
        AND archived_at IS NULL
        AND customer_count = 0
      LIMIT 20
    `);

    for (const t of emptyTags as any[]) {
      items.push({
        type: 'empty_tag',
        severity: 'info',
        tagId: t.id,
        tagName: t.name,
        detail: 'Tag has no customers assigned',
      });
    }

    // 3. High skip rate: actions with >50% skipped in last 30 days
    const skipRates = await tx.execute(sql`
      SELECT
        ta.tag_id,
        t.name AS tag_name,
        ta.action_type,
        COUNT(*) FILTER (WHERE tae.status = 'skipped')::int AS skipped,
        COUNT(*)::int AS total
      FROM tag_action_executions tae
      JOIN tag_actions ta ON ta.id = tae.tag_action_id
      JOIN tags t ON t.id = ta.tag_id
      WHERE tae.tenant_id = ${tenantId}
        AND tae.executed_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY ta.tag_id, t.name, ta.action_type
      HAVING COUNT(*) >= 5
        AND COUNT(*) FILTER (WHERE tae.status = 'skipped')::float / COUNT(*) > 0.5
      LIMIT 10
    `);

    for (const r of skipRates as any[]) {
      const rate = Math.round((Number(r.skipped) / Number(r.total)) * 100);
      items.push({
        type: 'high_skip_rate',
        severity: 'warning',
        tagId: r.tag_id,
        tagName: r.tag_name,
        detail: `${r.action_type} action skipped ${rate}% of the time (${r.skipped}/${r.total})`,
        value: rate,
      });
    }

    // 4. High failure rate: actions with >20% failures in last 30 days
    const failureRates = await tx.execute(sql`
      SELECT
        ta.tag_id,
        t.name AS tag_name,
        ta.action_type,
        COUNT(*) FILTER (WHERE tae.status = 'failed')::int AS failed,
        COUNT(*)::int AS total
      FROM tag_action_executions tae
      JOIN tag_actions ta ON ta.id = tae.tag_action_id
      JOIN tags t ON t.id = ta.tag_id
      WHERE tae.tenant_id = ${tenantId}
        AND tae.executed_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY ta.tag_id, t.name, ta.action_type
      HAVING COUNT(*) >= 3
        AND COUNT(*) FILTER (WHERE tae.status = 'failed')::float / COUNT(*) > 0.2
      LIMIT 10
    `);

    for (const r of failureRates as any[]) {
      const rate = Math.round((Number(r.failed) / Number(r.total)) * 100);
      items.push({
        type: 'high_failure_rate',
        severity: 'error',
        tagId: r.tag_id,
        tagName: r.tag_name,
        detail: `${r.action_type} action failing ${rate}% of the time (${r.failed}/${r.total})`,
        value: rate,
      });
    }

    // 5. Tags with no actions configured (smart tags only)
    const noActions = await tx.execute(sql`
      SELECT t.id, t.name
      FROM tags t
      JOIN smart_tag_rules r ON r.tag_id = t.id
      WHERE t.tenant_id = ${tenantId}
        AND t.is_active = true
        AND t.archived_at IS NULL
        AND r.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM tag_actions ta
          WHERE ta.tag_id = t.id AND ta.is_active = true
        )
      LIMIT 10
    `);

    for (const t of noActions as any[]) {
      items.push({
        type: 'no_actions',
        severity: 'info',
        tagId: t.id,
        tagName: t.name,
        detail: 'Smart tag has no active actions configured',
      });
    }

    // Recent activity (last 7 days)
    const activityRows = await tx.execute(sql`
      SELECT action, COUNT(*)::int AS count
      FROM tag_audit_log
      WHERE tenant_id = ${tenantId}
        AND occurred_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      GROUP BY action
      ORDER BY count DESC
    `);

    const recentActivity = (activityRows as any[]).map((r) => ({
      action: r.action,
      count: Number(r.count),
    }));

    // Compute overall score: start at 100, deduct for issues
    let score = 100;
    for (const item of items) {
      if (item.severity === 'error') score -= 10;
      else if (item.severity === 'warning') score -= 5;
      else score -= 2;
    }

    return {
      items,
      overallScore: Math.max(0, Math.min(100, score)),
      totalTags: Number(tagStats?.total_tags ?? 0),
      activeTags: Number(tagStats?.active_tags ?? 0),
      totalRules: Number(ruleStats?.total_rules ?? 0),
      activeRules: Number(ruleStats?.active_rules ?? 0),
      recentActivity,
    };
  });
}
