// ── Metric Pacing / Goal Tracking Service ────────────────────────
// Calculates progress toward metric goals, projected completion,
// and on-track status based on actual data from rm_daily_sales.

import { db } from '@oppsera/db';
import { semanticMetricGoals, rmDailySales } from '@oppsera/db';
import { sql, eq, and, gte, lte } from 'drizzle-orm';

// ── Types ────────────────────────────────────────────────────────

export interface PacingResult {
  goalId: string;
  metricSlug: string;
  targetValue: number;
  currentValue: number;
  /** Progress percentage: currentValue / targetValue * 100. */
  progressPct: number;
  /**
   * Pacing percentage: progressPct / (daysElapsed / totalDays) * 100.
   * 100% = perfectly on track. >100% = ahead of pace. <100% = behind.
   */
  pacingPct: number;
  /** Linear projection: currentValue / daysElapsed * totalDays. */
  projectedValue: number;
  /** Whether the projected value meets or exceeds the target. */
  onTrack: boolean;
  /** Calendar days remaining in the goal period. */
  daysRemaining: number;
  /** Calendar days elapsed since the goal period started. */
  daysElapsed: number;
  /** Total calendar days in the goal period. */
  totalDays: number;
  /** Goal period boundaries. */
  period: {
    type: string;
    start: string;
    end: string;
  };
  /** Null if goal has not started or has expired. */
  locationId: string | null;
  notes: string | null;
}

// ── Metric Column Mapping ───────────────────────────────────────

/**
 * Maps a metric slug to the SQL aggregation expression for rm_daily_sales.
 * Returns null for unsupported metrics.
 */
function metricToSqlExpression(metricSlug: string): string | null {
  const METRIC_SQL: Record<string, string> = {
    net_sales: 'SUM(CAST(net_sales AS DOUBLE PRECISION))',
    gross_sales: 'SUM(CAST(gross_sales AS DOUBLE PRECISION))',
    order_count: 'SUM(order_count)',
    avg_order_value: 'CASE WHEN SUM(order_count) > 0 THEN SUM(CAST(net_sales AS DOUBLE PRECISION)) / SUM(order_count) ELSE 0 END',
    discount_total: 'SUM(CAST(discount_total AS DOUBLE PRECISION))',
    tax_total: 'SUM(CAST(tax_total AS DOUBLE PRECISION))',
    void_count: 'SUM(void_count)',
    void_total: 'SUM(CAST(void_total AS DOUBLE PRECISION))',
    tender_cash: 'SUM(CAST(tender_cash AS DOUBLE PRECISION))',
    tender_card: 'SUM(CAST(tender_card AS DOUBLE PRECISION))',
  };

  return METRIC_SQL[metricSlug] ?? null;
}

// ── Date Helpers ────────────────────────────────────────────────

function daysBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

// ── Core Calculation ────────────────────────────────────────────

/**
 * Calculates pacing for a single metric goal. Queries rm_daily_sales
 * for actual values within the goal period up to today, then projects
 * a linear trend to the period end.
 */
export async function calculatePacing(
  tenantId: string,
  goalId: string,
): Promise<PacingResult | null> {
  // Fetch the goal
  const [goal] = await db
    .select()
    .from(semanticMetricGoals)
    .where(
      and(
        eq(semanticMetricGoals.tenantId, tenantId),
        eq(semanticMetricGoals.id, goalId),
      ),
    );

  if (!goal) return null;

  return computePacingForGoal(tenantId, goal);
}

/**
 * Calculates pacing for all active goals for a tenant.
 */
export async function calculateAllPacing(
  tenantId: string,
): Promise<PacingResult[]> {
  const goals = await db
    .select()
    .from(semanticMetricGoals)
    .where(
      and(
        eq(semanticMetricGoals.tenantId, tenantId),
        eq(semanticMetricGoals.isActive, true),
      ),
    );

  if (goals.length === 0) return [];

  const results = await Promise.all(
    goals.map((goal) => computePacingForGoal(tenantId, goal)),
  );

  return results.filter((r): r is PacingResult => r !== null);
}

// ── Internal Computation ────────────────────────────────────────

async function computePacingForGoal(
  tenantId: string,
  goal: typeof semanticMetricGoals.$inferSelect,
): Promise<PacingResult | null> {
  const sqlExpr = metricToSqlExpression(goal.metricSlug);
  if (!sqlExpr) {
    // Unsupported metric slug
    return null;
  }

  const today = todayStr();
  const periodStart = goal.periodStart;
  const periodEnd = goal.periodEnd;

  const totalDays = daysBetween(periodStart, periodEnd);

  // Clamp the effective end date to today (no future data)
  const effectiveEnd = today < periodEnd ? today : periodEnd;
  const daysElapsed = today >= periodStart
    ? Math.min(daysBetween(periodStart, effectiveEnd), totalDays)
    : 0;
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  // If the period hasn't started yet, return zero-state
  if (today < periodStart) {
    const targetValue = Number(goal.targetValue);
    return {
      goalId: goal.id,
      metricSlug: goal.metricSlug,
      targetValue,
      currentValue: 0,
      progressPct: 0,
      pacingPct: 0,
      projectedValue: 0,
      onTrack: false,
      daysRemaining: totalDays,
      daysElapsed: 0,
      totalDays,
      period: { type: goal.periodType, start: periodStart, end: periodEnd },
      locationId: goal.locationId,
      notes: goal.notes,
    };
  }

  // Query the actual aggregated value from rm_daily_sales
  const locationFilter = goal.locationId
    ? sql`AND location_id = ${goal.locationId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT ${sql.raw(sqlExpr)} AS current_value
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${periodStart}
      AND business_date <= ${effectiveEnd}
      ${locationFilter}
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const currentValue = Number(rows[0]?.current_value ?? 0);
  const targetValue = Number(goal.targetValue);

  // Compute pacing metrics
  const progressPct = targetValue > 0
    ? Math.round((currentValue / targetValue) * 10000) / 100
    : 0;

  const expectedProgressPct = totalDays > 0
    ? (daysElapsed / totalDays) * 100
    : 0;

  const pacingPct = expectedProgressPct > 0
    ? Math.round((progressPct / expectedProgressPct) * 10000) / 100
    : 0;

  const projectedValue = daysElapsed > 0
    ? Math.round((currentValue / daysElapsed) * totalDays * 100) / 100
    : 0;

  const onTrack = projectedValue >= targetValue;

  return {
    goalId: goal.id,
    metricSlug: goal.metricSlug,
    targetValue,
    currentValue: Math.round(currentValue * 100) / 100,
    progressPct,
    pacingPct,
    projectedValue,
    onTrack,
    daysRemaining,
    daysElapsed,
    totalDays,
    period: { type: goal.periodType, start: periodStart, end: periodEnd },
    locationId: goal.locationId,
    notes: goal.notes,
  };
}
