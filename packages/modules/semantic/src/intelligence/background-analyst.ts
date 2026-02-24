// ── Background Analyst ─────────────────────────────────────────────
// Agentic background analysis service that scans tenant data for
// actionable findings: trend detection, day-of-week patterns, top
// mover items, cross-metric correlations, and goal pacing alerts.
// Designed to run on a schedule (e.g., daily via background job).

import { db, withTenant } from '@oppsera/db';
import {
  rmDailySales,
  rmItemSales,
  rmInventoryOnHand,
  semanticAnalysisFindings,
  semanticMetricGoals,
} from '@oppsera/db';
import { sql, eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── Types ──────────────────────────────────────────────────────────

export type FindingType =
  | 'trend_change'
  | 'day_of_week_pattern'
  | 'top_mover_up'
  | 'top_mover_down'
  | 'correlation'
  | 'goal_pacing';

export type FindingPriority = 'critical' | 'high' | 'medium' | 'low';

export interface SparklinePoint {
  date: string;
  value: number;
}

export interface AnalysisFinding {
  id: string;
  tenantId: string;
  findingType: FindingType;
  title: string;
  summary: string;
  confidence: number;
  priority: FindingPriority;
  suggestedActions: string[];
  chartData: SparklinePoint[] | null;
  metricSlugs: string[];
  baselineValue: number | null;
  observedValue: number | null;
  changePct: number | null;
  businessDateStart: string | null;
  businessDateEnd: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────

const TREND_THRESHOLD_PCT = 15; // Flag >=15% period-over-period change
const GOAL_OFF_TRACK_PCT = 10;  // Flag goals off track by >10%
const TOP_MOVERS_LIMIT = 5;     // Number of top mover items to return
const DOW_WEEKS_LOOKBACK = 4;   // Compare same day-of-week over 4 weeks
const DOW_CHANGE_THRESHOLD = 20; // Flag >=20% consistent DOW change

// ── Priority helpers ───────────────────────────────────────────────

function computePriority(changePct: number, findingType: FindingType): FindingPriority {
  const absPct = Math.abs(changePct);

  if (findingType === 'goal_pacing') {
    return absPct >= 25 ? 'critical' : absPct >= 15 ? 'high' : 'medium';
  }
  if (findingType === 'correlation') {
    return 'high';
  }
  if (absPct >= 30) return 'critical';
  if (absPct >= 20) return 'high';
  if (absPct >= TREND_THRESHOLD_PCT) return 'medium';
  return 'low';
}

// ── Row mapper ─────────────────────────────────────────────────────

function rowToFinding(row: typeof semanticAnalysisFindings.$inferSelect): AnalysisFinding {
  return {
    id: row.id,
    tenantId: row.tenantId,
    findingType: row.findingType as FindingType,
    title: row.title,
    summary: row.summary,
    confidence: Number(row.confidence ?? 0),
    priority: row.priority as FindingPriority,
    suggestedActions: (row.suggestedActions as string[] | null) ?? [],
    chartData: (row.chartData as SparklinePoint[] | null) ?? null,
    metricSlugs: (row.metricSlugs as string[] | null) ?? [],
    baselineValue: row.baselineValue != null ? Number(row.baselineValue) : null,
    observedValue: row.observedValue != null ? Number(row.observedValue) : null,
    changePct: row.changePct != null ? Number(row.changePct) : null,
    businessDateStart: row.businessDateStart ?? null,
    businessDateEnd: row.businessDateEnd ?? null,
    isRead: row.isRead,
    isDismissed: row.isDismissed,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Scan: Trend Detection ──────────────────────────────────────────
// Compare last 7 days to previous 7 days for core metrics.

interface TrendResult {
  metricSlug: string;
  metricLabel: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
  sparkline: SparklinePoint[];
}

async function detectTrends(tenantId: string, currentDate: string): Promise<TrendResult[]> {
  const results: TrendResult[] = [];

  const metricsToCheck: Array<{ slug: string; column: string; label: string }> = [
    { slug: 'net_sales', column: 'net_sales', label: 'Net Sales' },
    { slug: 'order_count', column: 'order_count', label: 'Order Count' },
    { slug: 'avg_order_value', column: 'avg_order_value', label: 'Avg Order Value' },
    { slug: 'discount_total', column: 'discount_total', label: 'Discounts' },
    { slug: 'void_count', column: 'void_count', label: 'Void Count' },
  ];

  await withTenant(tenantId, async (tx) => {
    for (const metric of metricsToCheck) {
      // Current period: last 7 days
      const currentRows = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${sql.raw(metric.column)}), 0)`,
        })
        .from(rmDailySales)
        .where(and(
          eq(rmDailySales.tenantId, tenantId),
          gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '7 days')::date`),
          lte(rmDailySales.businessDate, sql`${currentDate}::date`),
        ));

      // Previous period: 8-14 days ago
      const previousRows = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${sql.raw(metric.column)}), 0)`,
        })
        .from(rmDailySales)
        .where(and(
          eq(rmDailySales.tenantId, tenantId),
          gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '14 days')::date`),
          lte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '8 days')::date`),
        ));

      const currentValue = Number(currentRows[0]?.total ?? 0);
      const previousValue = Number(previousRows[0]?.total ?? 0);

      if (previousValue === 0) continue;

      const changePct = ((currentValue - previousValue) / previousValue) * 100;

      if (Math.abs(changePct) < TREND_THRESHOLD_PCT) continue;

      // Build sparkline for last 14 days
      const sparklineRows = await tx
        .select({
          date: rmDailySales.businessDate,
          value: sql<string>`COALESCE(SUM(${sql.raw(metric.column)}), 0)`,
        })
        .from(rmDailySales)
        .where(and(
          eq(rmDailySales.tenantId, tenantId),
          gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '14 days')::date`),
          lte(rmDailySales.businessDate, sql`${currentDate}::date`),
        ))
        .groupBy(rmDailySales.businessDate)
        .orderBy(asc(rmDailySales.businessDate));

      const sparkline: SparklinePoint[] = sparklineRows.map((r) => ({
        date: String(r.date),
        value: Number(r.value),
      }));

      results.push({
        metricSlug: metric.slug,
        metricLabel: metric.label,
        currentValue,
        previousValue,
        changePct: Math.round(changePct * 100) / 100,
        sparkline,
      });
    }
  });

  return results;
}

// ── Scan: Day-of-Week Patterns ─────────────────────────────────────
// Compare same day-of-week over last 4 weeks for consistent patterns.

interface DowResult {
  dayOfWeek: number;
  dayName: string;
  metricSlug: string;
  metricLabel: string;
  thisWeekValue: number;
  avgPriorWeeks: number;
  changePct: number;
}

async function detectDowPatterns(tenantId: string, currentDate: string): Promise<DowResult[]> {
  const results: DowResult[] = [];

  await withTenant(tenantId, async (tx) => {
    // Get net_sales and order_count grouped by day of week, per-week
    const rows = await tx
      .select({
        dayOfWeek: sql<string>`EXTRACT(DOW FROM business_date)`,
        weekOffset: sql<string>`FLOOR(EXTRACT(EPOCH FROM (${currentDate}::date - business_date)) / 86400 / 7)`,
        netSales: sql<string>`COALESCE(SUM(net_sales), 0)`,
        orderCount: sql<string>`COALESCE(SUM(order_count), 0)`,
      })
      .from(rmDailySales)
      .where(and(
        eq(rmDailySales.tenantId, tenantId),
        gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '${sql.raw(String(DOW_WEEKS_LOOKBACK * 7))} days')::date`),
        lte(rmDailySales.businessDate, sql`${currentDate}::date`),
      ))
      .groupBy(
        sql`EXTRACT(DOW FROM business_date)`,
        sql`FLOOR(EXTRACT(EPOCH FROM (${currentDate}::date - business_date)) / 86400 / 7)`,
      );

    // Group by day of week
    const byDow = new Map<number, { thisWeek: number; priorWeeks: number[] }>();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const row of rows) {
      const dow = Number(row.dayOfWeek);
      const weekOffset = Number(row.weekOffset);
      const netSales = Number(row.netSales);

      if (!byDow.has(dow)) {
        byDow.set(dow, { thisWeek: 0, priorWeeks: [] });
      }
      const entry = byDow.get(dow)!;

      if (weekOffset === 0) {
        entry.thisWeek = netSales;
      } else {
        entry.priorWeeks.push(netSales);
      }
    }

    for (const [dow, data] of byDow) {
      if (data.priorWeeks.length < 2) continue; // Need at least 2 prior weeks for comparison

      const avgPrior = data.priorWeeks.reduce((a, b) => a + b, 0) / data.priorWeeks.length;
      if (avgPrior === 0) continue;

      const changePct = ((data.thisWeek - avgPrior) / avgPrior) * 100;

      if (Math.abs(changePct) < DOW_CHANGE_THRESHOLD) continue;

      results.push({
        dayOfWeek: dow,
        dayName: dayNames[dow] ?? `Day ${dow}`,
        metricSlug: 'net_sales',
        metricLabel: 'Net Sales',
        thisWeekValue: data.thisWeek,
        avgPriorWeeks: Math.round(avgPrior * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
      });
    }
  });

  return results;
}

// ── Scan: Top Mover Items ──────────────────────────────────────────

interface TopMoverResult {
  catalogItemName: string;
  categoryName: string | null;
  currentRevenue: number;
  previousRevenue: number;
  changePct: number;
  direction: 'up' | 'down';
}

async function detectTopMovers(tenantId: string, currentDate: string): Promise<TopMoverResult[]> {
  return withTenant(tenantId, async (tx) => {
    // Compare item revenue: last 7 days vs previous 7 days
    const rows = await tx
      .select({
        catalogItemName: rmItemSales.catalogItemName,
        categoryName: rmItemSales.categoryName,
        currentRevenue: sql<string>`COALESCE(SUM(CASE WHEN business_date >= (${currentDate}::date - INTERVAL '7 days')::date THEN gross_revenue ELSE 0 END), 0)`,
        previousRevenue: sql<string>`COALESCE(SUM(CASE WHEN business_date < (${currentDate}::date - INTERVAL '7 days')::date AND business_date >= (${currentDate}::date - INTERVAL '14 days')::date THEN gross_revenue ELSE 0 END), 0)`,
      })
      .from(rmItemSales)
      .where(and(
        eq(rmItemSales.tenantId, tenantId),
        gte(rmItemSales.businessDate, sql`(${currentDate}::date - INTERVAL '14 days')::date`),
        lte(rmItemSales.businessDate, sql`${currentDate}::date`),
      ))
      .groupBy(rmItemSales.catalogItemName, rmItemSales.categoryName);

    const movers: TopMoverResult[] = [];

    for (const row of rows) {
      const current = Number(row.currentRevenue);
      const previous = Number(row.previousRevenue);

      if (previous === 0 && current === 0) continue;

      // Handle new items (previous = 0) and disappeared items (current = 0)
      const changePct = previous === 0
        ? 100
        : ((current - previous) / previous) * 100;

      if (Math.abs(changePct) < TREND_THRESHOLD_PCT) continue;

      movers.push({
        catalogItemName: row.catalogItemName,
        categoryName: row.categoryName ?? null,
        currentRevenue: current,
        previousRevenue: previous,
        changePct: Math.round(changePct * 100) / 100,
        direction: changePct >= 0 ? 'up' : 'down',
      });
    }

    // Sort by absolute change and take top movers in each direction
    movers.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    const topUp = movers.filter((m) => m.direction === 'up').slice(0, TOP_MOVERS_LIMIT);
    const topDown = movers.filter((m) => m.direction === 'down').slice(0, TOP_MOVERS_LIMIT);

    return [...topUp, ...topDown];
  });
}

// ── Scan: Correlation Detection ────────────────────────────────────
// If sales are down AND inventory is high, flag overstock potential.

interface CorrelationResult {
  title: string;
  summary: string;
  metricSlugs: string[];
  confidence: number;
}

async function detectCorrelations(tenantId: string, currentDate: string): Promise<CorrelationResult[]> {
  const correlations: CorrelationResult[] = [];

  await withTenant(tenantId, async (tx) => {
    // Check: sales trending down + high inventory
    const salesTrend = await tx
      .select({
        currentSales: sql<string>`COALESCE(SUM(CASE WHEN business_date >= (${currentDate}::date - INTERVAL '7 days')::date THEN net_sales ELSE 0 END), 0)`,
        previousSales: sql<string>`COALESCE(SUM(CASE WHEN business_date >= (${currentDate}::date - INTERVAL '14 days')::date AND business_date < (${currentDate}::date - INTERVAL '7 days')::date THEN net_sales ELSE 0 END), 0)`,
      })
      .from(rmDailySales)
      .where(and(
        eq(rmDailySales.tenantId, tenantId),
        gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '14 days')::date`),
        lte(rmDailySales.businessDate, sql`${currentDate}::date`),
      ));

    const currentSales = Number(salesTrend[0]?.currentSales ?? 0);
    const previousSales = Number(salesTrend[0]?.previousSales ?? 0);

    if (previousSales > 0) {
      const salesChangePct = ((currentSales - previousSales) / previousSales) * 100;

      // If sales are down, check inventory levels
      if (salesChangePct < -10) {
        const inventoryCount = await tx
          .select({
            highStockItems: sql<string>`COUNT(*) FILTER (WHERE on_hand > reorder_point * 2)`,
            totalItems: sql<string>`COUNT(*)`,
          })
          .from(rmInventoryOnHand)
          .where(eq(rmInventoryOnHand.tenantId, tenantId));

        const highStock = Number(inventoryCount[0]?.highStockItems ?? 0);
        const totalItems = Number(inventoryCount[0]?.totalItems ?? 0);

        if (totalItems > 0 && highStock / totalItems > 0.3) {
          correlations.push({
            title: 'Possible overstock situation',
            summary: `Sales are down ${Math.abs(Math.round(salesChangePct))}% this week while ${highStock} of ${totalItems} items are at 2x+ their reorder point. Consider running a promotion or adjusting order quantities.`,
            metricSlugs: ['net_sales', 'inventory_on_hand'],
            confidence: 0.7,
          });
        }
      }

      // If sales are up significantly, check for low inventory
      if (salesChangePct > 20) {
        const lowStockCount = await tx
          .select({
            belowThreshold: sql<string>`COUNT(*) FILTER (WHERE is_below_threshold = true)`,
          })
          .from(rmInventoryOnHand)
          .where(eq(rmInventoryOnHand.tenantId, tenantId));

        const lowItems = Number(lowStockCount[0]?.belowThreshold ?? 0);

        if (lowItems >= 3) {
          correlations.push({
            title: 'Strong sales with low stock risk',
            summary: `Sales surged ${Math.round(salesChangePct)}% this week but ${lowItems} items are below their reorder point. Reorder soon to avoid stockouts during this uptick.`,
            metricSlugs: ['net_sales', 'inventory_on_hand'],
            confidence: 0.75,
          });
        }
      }
    }

    // Check: high void rate correlation
    const voidCheck = await tx
      .select({
        voidCount: sql<string>`COALESCE(SUM(void_count), 0)`,
        orderCount: sql<string>`COALESCE(SUM(order_count), 0)`,
      })
      .from(rmDailySales)
      .where(and(
        eq(rmDailySales.tenantId, tenantId),
        gte(rmDailySales.businessDate, sql`(${currentDate}::date - INTERVAL '7 days')::date`),
        lte(rmDailySales.businessDate, sql`${currentDate}::date`),
      ));

    const voidCount = Number(voidCheck[0]?.voidCount ?? 0);
    const orderCount = Number(voidCheck[0]?.orderCount ?? 0);

    if (orderCount > 0 && (voidCount / orderCount) > 0.05) {
      correlations.push({
        title: 'Elevated void rate',
        summary: `${voidCount} voids out of ${orderCount} orders (${((voidCount / orderCount) * 100).toFixed(1)}%) this week. Normal is under 3%. Investigate training gaps or pricing errors.`,
        metricSlugs: ['void_count', 'order_count'],
        confidence: 0.8,
      });
    }
  });

  return correlations;
}

// ── Scan: Goal Pacing ──────────────────────────────────────────────

interface GoalPacingResult {
  metricSlug: string;
  targetValue: number;
  currentPace: number;
  projectedValue: number;
  gapPct: number;
  periodStart: string;
  periodEnd: string;
}

async function checkGoalPacing(tenantId: string, currentDate: string): Promise<GoalPacingResult[]> {
  const results: GoalPacingResult[] = [];

  await withTenant(tenantId, async (tx) => {
    // Fetch active goals that span the current date
    const goals = await tx
      .select()
      .from(semanticMetricGoals)
      .where(and(
        eq(semanticMetricGoals.tenantId, tenantId),
        eq(semanticMetricGoals.isActive, true),
        lte(semanticMetricGoals.periodStart, sql`${currentDate}::date`),
        gte(semanticMetricGoals.periodEnd, sql`${currentDate}::date`),
      ));

    for (const goal of goals) {
      const metricColumn = getMetricColumnForGoal(goal.metricSlug);
      if (!metricColumn) continue;

      // Sum the metric from period start to current date
      const actualRows = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${sql.raw(metricColumn)}), 0)`,
        })
        .from(rmDailySales)
        .where(and(
          eq(rmDailySales.tenantId, tenantId),
          gte(rmDailySales.businessDate, goal.periodStart),
          lte(rmDailySales.businessDate, sql`${currentDate}::date`),
        ));

      const actualValue = Number(actualRows[0]?.total ?? 0);
      const targetValue = Number(goal.targetValue);

      // Calculate days elapsed and remaining
      const periodStartDate = new Date(goal.periodStart);
      const periodEndDate = new Date(goal.periodEnd);
      const currentDateObj = new Date(currentDate);

      const totalDays = Math.max(1, (periodEndDate.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const elapsedDays = Math.max(1, (currentDateObj.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24));

      // Project current pace to end of period
      const dailyPace = actualValue / elapsedDays;
      const projectedValue = dailyPace * totalDays;

      const gapPct = targetValue !== 0
        ? ((projectedValue - targetValue) / targetValue) * 100
        : 0;

      // Only flag if off track by more than threshold
      if (gapPct < -GOAL_OFF_TRACK_PCT) {
        results.push({
          metricSlug: goal.metricSlug,
          targetValue,
          currentPace: Math.round(dailyPace * 100) / 100,
          projectedValue: Math.round(projectedValue * 100) / 100,
          gapPct: Math.round(gapPct * 100) / 100,
          periodStart: goal.periodStart,
          periodEnd: goal.periodEnd,
        });
      }
    }
  });

  return results;
}

function getMetricColumnForGoal(metricSlug: string): string | null {
  const map: Record<string, string> = {
    net_sales: 'net_sales',
    gross_sales: 'gross_sales',
    order_count: 'order_count',
    discount_total: 'discount_total',
    tender_cash: 'tender_cash',
    tender_card: 'tender_card',
  };
  return map[metricSlug] ?? null;
}

// ── Finding builder ────────────────────────────────────────────────

function buildFinding(
  tenantId: string,
  analysisRunId: string,
  findingType: FindingType,
  title: string,
  summary: string,
  opts: {
    confidence?: number;
    suggestedActions?: string[];
    chartData?: SparklinePoint[] | null;
    metricSlugs?: string[];
    baselineValue?: number | null;
    observedValue?: number | null;
    changePct?: number | null;
    businessDateStart?: string | null;
    businessDateEnd?: string | null;
  } = {},
): typeof semanticAnalysisFindings.$inferInsert {
  const changePct = opts.changePct ?? 0;
  return {
    id: generateUlid(),
    tenantId,
    findingType,
    title,
    summary,
    confidence: String(opts.confidence ?? 0.7),
    priority: computePriority(changePct, findingType),
    suggestedActions: opts.suggestedActions ?? [],
    chartData: opts.chartData ?? null,
    metricSlugs: opts.metricSlugs ?? [],
    baselineValue: opts.baselineValue != null ? String(opts.baselineValue) : null,
    observedValue: opts.observedValue != null ? String(opts.observedValue) : null,
    changePct: opts.changePct != null ? String(opts.changePct) : null,
    businessDateStart: opts.businessDateStart ?? null,
    businessDateEnd: opts.businessDateEnd ?? null,
    analysisRunId,
    isActionable: true,
  };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Runs background analysis scans for a tenant and persists findings.
 *
 * Performs multiple scans:
 * 1. Trend detection: 7-day vs previous 7-day comparison
 * 2. Day-of-week patterns: same DOW over 4 weeks
 * 3. Top mover items: biggest revenue changes (up or down)
 * 4. Correlation detection: cross-metric signals (sales + inventory)
 * 5. Goal pacing alerts: goals off track by >10%
 *
 * Each finding is persisted to `semantic_analysis_findings` and
 * returned ordered by priority.
 */
export async function runBackgroundAnalysis(
  tenantId: string,
  currentDate: string,
): Promise<AnalysisFinding[]> {
  const analysisRunId = generateUlid();
  const startMs = Date.now();
  const insertRows: (typeof semanticAnalysisFindings.$inferInsert)[] = [];

  // ── 1. Trend detection ─────────────────────────────────────────
  const trends = await detectTrends(tenantId, currentDate);
  for (const trend of trends) {
    const direction = trend.changePct >= 0 ? 'up' : 'down';
    const dirLabel = direction === 'up' ? 'increased' : 'decreased';

    insertRows.push(buildFinding(tenantId, analysisRunId, 'trend_change',
      `${trend.metricLabel} ${dirLabel} ${Math.abs(trend.changePct).toFixed(1)}%`,
      `${trend.metricLabel} ${dirLabel} from $${trend.previousValue.toLocaleString()} to $${trend.currentValue.toLocaleString()} over the last 7 days compared to the previous 7 days.`,
      {
        confidence: 0.85,
        suggestedActions: direction === 'down'
          ? ['Review pricing strategy', 'Check for operational issues', 'Compare marketing activity between periods']
          : ['Identify what drove the increase', 'Consider scaling what worked', 'Monitor sustainability'],
        chartData: trend.sparkline,
        metricSlugs: [trend.metricSlug],
        baselineValue: trend.previousValue,
        observedValue: trend.currentValue,
        changePct: trend.changePct,
      },
    ));
  }

  // ── 2. Day-of-week patterns ────────────────────────────────────
  const dowPatterns = await detectDowPatterns(tenantId, currentDate);
  for (const dow of dowPatterns) {
    const direction = dow.changePct >= 0 ? 'stronger' : 'weaker';

    insertRows.push(buildFinding(tenantId, analysisRunId, 'day_of_week_pattern',
      `${dow.dayName}s are running ${direction} than usual`,
      `${dow.metricLabel} on ${dow.dayName} was $${dow.thisWeekValue.toLocaleString()} vs a ${DOW_WEEKS_LOOKBACK}-week average of $${dow.avgPriorWeeks.toLocaleString()} (${dow.changePct > 0 ? '+' : ''}${dow.changePct.toFixed(1)}%).`,
      {
        confidence: 0.7,
        suggestedActions: dow.changePct < 0
          ? [`Investigate what changed on ${dow.dayName}s`, 'Check staffing levels', 'Review recent promotions']
          : [`Capitalize on strong ${dow.dayName} performance`, `Consider ${dow.dayName}-specific promotions`],
        metricSlugs: [dow.metricSlug],
        baselineValue: dow.avgPriorWeeks,
        observedValue: dow.thisWeekValue,
        changePct: dow.changePct,
      },
    ));
  }

  // ── 3. Top mover items ─────────────────────────────────────────
  const movers = await detectTopMovers(tenantId, currentDate);
  for (const mover of movers) {
    const findingType: FindingType = mover.direction === 'up' ? 'top_mover_up' : 'top_mover_down';
    const label = mover.direction === 'up' ? 'surging' : 'declining';

    insertRows.push(buildFinding(tenantId, analysisRunId, findingType,
      `${mover.catalogItemName} is ${label} (${mover.changePct > 0 ? '+' : ''}${mover.changePct.toFixed(1)}%)`,
      `"${mover.catalogItemName}"${mover.categoryName ? ` (${mover.categoryName})` : ''} revenue went from $${mover.previousRevenue.toLocaleString()} to $${mover.currentRevenue.toLocaleString()} week-over-week.`,
      {
        confidence: 0.8,
        suggestedActions: mover.direction === 'up'
          ? ['Ensure sufficient stock', 'Consider featuring this item', 'Check if promotion is driving the increase']
          : ['Review pricing', 'Check stock availability', 'Consider replacing or promoting this item'],
        metricSlugs: ['item_revenue'],
        baselineValue: mover.previousRevenue,
        observedValue: mover.currentRevenue,
        changePct: mover.changePct,
      },
    ));
  }

  // ── 4. Correlation detection ───────────────────────────────────
  const correlations = await detectCorrelations(tenantId, currentDate);
  for (const corr of correlations) {
    insertRows.push(buildFinding(tenantId, analysisRunId, 'correlation',
      corr.title,
      corr.summary,
      {
        confidence: corr.confidence,
        suggestedActions: [
          'Review inventory levels relative to sales velocity',
          'Adjust reorder points based on current trends',
          'Consider markdown or promotional strategy',
        ],
        metricSlugs: corr.metricSlugs,
      },
    ));
  }

  // ── 5. Goal pacing ─────────────────────────────────────────────
  const goalAlerts = await checkGoalPacing(tenantId, currentDate);
  for (const goal of goalAlerts) {
    const metricLabel = goal.metricSlug.replace(/_/g, ' ');
    insertRows.push(buildFinding(tenantId, analysisRunId, 'goal_pacing',
      `${metricLabel} goal is off track by ${Math.abs(goal.gapPct).toFixed(1)}%`,
      `At current pace ($${goal.currentPace.toLocaleString()}/day), you'll reach $${goal.projectedValue.toLocaleString()} by end of period vs the target of $${Number(goal.targetValue).toLocaleString()}.`,
      {
        confidence: 0.9,
        suggestedActions: [
          'Identify quick-win revenue boosters',
          'Review operational efficiency',
          'Consider promotional campaign to close the gap',
        ],
        metricSlugs: [goal.metricSlug],
        baselineValue: goal.targetValue,
        observedValue: goal.projectedValue,
        changePct: goal.gapPct,
        businessDateStart: goal.periodStart,
        businessDateEnd: goal.periodEnd,
      },
    ));
  }

  // ── Persist all findings ───────────────────────────────────────
  const durationMs = Date.now() - startMs;

  if (insertRows.length > 0) {
    // Add duration to all rows
    const rowsWithDuration = insertRows.map((r) => ({
      ...r,
      analysisDurationMs: durationMs,
    }));

    await db.insert(semanticAnalysisFindings).values(rowsWithDuration);
  }

  console.log(`[background-analyst] Analysis complete for tenant ${tenantId}: ${insertRows.length} findings in ${durationMs}ms`);

  // Return findings ordered by priority
  const priorityOrder: Record<FindingPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  // Re-fetch from DB to get consistent row mapping
  if (insertRows.length === 0) return [];

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(semanticAnalysisFindings)
      .where(eq(semanticAnalysisFindings.analysisRunId, analysisRunId))
      .orderBy(desc(semanticAnalysisFindings.createdAt));

    return rows
      .map(rowToFinding)
      .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));
  });
}

// ── Read / Dismiss API ─────────────────────────────────────────────

/**
 * Returns unread, non-dismissed findings for a tenant, newest first.
 */
export async function getUnreadFindings(
  tenantId: string,
  limit: number = 20,
): Promise<AnalysisFinding[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(semanticAnalysisFindings)
      .where(and(
        eq(semanticAnalysisFindings.tenantId, tenantId),
        eq(semanticAnalysisFindings.isRead, false),
        eq(semanticAnalysisFindings.isDismissed, false),
      ))
      .orderBy(desc(semanticAnalysisFindings.createdAt))
      .limit(limit);

    return rows.map(rowToFinding);
  });
}

/**
 * Marks a finding as read.
 */
export async function markFindingRead(
  tenantId: string,
  findingId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(semanticAnalysisFindings)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(and(
        eq(semanticAnalysisFindings.id, findingId),
        eq(semanticAnalysisFindings.tenantId, tenantId),
      ));
  });
}

/**
 * Dismisses a finding so it no longer appears in the feed.
 */
export async function dismissFinding(
  tenantId: string,
  findingId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(semanticAnalysisFindings)
      .set({
        isDismissed: true,
        isRead: true,
        readAt: new Date(),
      })
      .where(and(
        eq(semanticAnalysisFindings.id, findingId),
        eq(semanticAnalysisFindings.tenantId, tenantId),
      ));
  });
}
