// ── Root Cause Analyzer ──────────────────────────────────────────
// Automated root cause analysis: "Why did X change?" decomposition.
// Compares a metric across two time periods, then breaks down the
// total change by available dimensions (location, day-of-week,
// item category) to identify the top contributors. Runs entirely
// against reporting read models — no operational table access.

import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────

export interface RootCauseDateRange {
  /** Start of the period to analyze (YYYY-MM-DD). */
  start: string;
  /** End of the period to analyze (YYYY-MM-DD). */
  end: string;
}

export interface RootCauseOptions {
  /** Location filter. If omitted, analyzes all locations. */
  locationId?: string;
  /** Maximum contributors to return per dimension (default: 10). */
  maxContributors?: number;
  /**
   * Comparison period override. If omitted, the comparison period
   * is automatically computed as the same-length window immediately
   * before the analysis period.
   */
  comparisonRange?: RootCauseDateRange;
}

export type ContributionDirection = 'positive' | 'negative' | 'flat';

export interface Contributor {
  /** The dimension used for decomposition (e.g., 'location', 'day_of_week', 'item_category'). */
  dimension: string;
  /** The specific value within that dimension (e.g., location name, 'Monday', category name). */
  dimensionValue: string;
  /** Absolute change attributed to this contributor (dollars or count). */
  contribution: number;
  /** Percentage of the total change explained by this contributor. */
  contributionPct: number;
  /** Whether this contributor increased or decreased the metric. */
  direction: ContributionDirection;
  /** Value in the comparison (prior) period. */
  previousValue: number;
  /** Value in the current (analysis) period. */
  currentValue: number;
}

export interface RootCauseResult {
  /** The metric that was analyzed. */
  metric: string;
  /** Total absolute change between periods (current - previous). */
  totalChange: number;
  /** Percentage change between periods. */
  changePct: number;
  /** Aggregate value in the current period. */
  currentTotal: number;
  /** Aggregate value in the comparison period. */
  previousTotal: number;
  /** Top contributors ranked by absolute contribution descending. */
  contributors: Contributor[];
  /** Human-readable summary of the root cause analysis. */
  summary: string;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_CONTRIBUTORS = 10;

/**
 * Maps metric slugs to their column name in `rm_daily_sales`.
 * All of these store dollar amounts as NUMERIC(19,4).
 */
const METRIC_COLUMN_MAP: Record<string, string> = {
  net_sales: 'net_sales',
  gross_sales: 'gross_sales',
  order_count: 'order_count',
  avg_order_value: 'avg_order_value',
  discount_total: 'discount_total',
  tax_total: 'tax_total',
  void_count: 'void_count',
  void_total: 'void_total',
  tender_cash: 'tender_cash',
  tender_card: 'tender_card',
};

/** Day-of-week labels indexed by PostgreSQL EXTRACT(DOW) (0=Sunday). */
const DOW_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

// ── Helpers ────────────────────────────────────────────────────────

function resolveColumn(metricSlug: string): string | null {
  return METRIC_COLUMN_MAP[metricSlug] ?? null;
}

function classifyDirection(value: number): ContributionDirection {
  if (value > 0.005) return 'positive';
  if (value < -0.005) return 'negative';
  return 'flat';
}

/**
 * Computes the automatic comparison range by shifting the analysis
 * range backward by its own length.
 */
function computeComparisonRange(analysisRange: RootCauseDateRange): RootCauseDateRange {
  const start = new Date(analysisRange.start);
  const end = new Date(analysisRange.end);
  const durationMs = end.getTime() - start.getTime();
  const daysInPeriod = Math.max(1, Math.round(durationMs / (1000 * 60 * 60 * 24)));

  const compEnd = new Date(start);
  compEnd.setDate(compEnd.getDate() - 1);
  const compStart = new Date(compEnd);
  compStart.setDate(compStart.getDate() - daysInPeriod + 1);

  return {
    start: compStart.toISOString().split('T')[0]!,
    end: compEnd.toISOString().split('T')[0]!,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDollars(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? `$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `$${abs.toFixed(2)}`;
  return n < 0 ? `-${formatted}` : formatted;
}

// ── Dimension Decomposition Queries ────────────────────────────────

interface DimensionBreakdown {
  dimensionValue: string;
  currentValue: number;
  previousValue: number;
}

/**
 * Decomposes the metric change by location_id. Each row in rm_daily_sales
 * already has a location_id, so we can directly group by it.
 */
async function decomposeByLocation(
  tenantId: string,
  column: string,
  currentRange: RootCauseDateRange,
  comparisonRange: RootCauseDateRange,
  locationId?: string,
): Promise<DimensionBreakdown[]> {
  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      location_id AS dimension_value,
      COALESCE(SUM(CASE
        WHEN business_date >= ${currentRange.start} AND business_date <= ${currentRange.end}
        THEN CAST(${sql.raw(column)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS current_value,
      COALESCE(SUM(CASE
        WHEN business_date >= ${comparisonRange.start} AND business_date <= ${comparisonRange.end}
        THEN CAST(${sql.raw(column)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS previous_value
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${comparisonRange.start}
      AND business_date <= ${currentRange.end}
      ${locationFilter}
    GROUP BY location_id
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    dimensionValue: String(r.dimension_value ?? 'Unknown'),
    currentValue: Number(r.current_value ?? 0),
    previousValue: Number(r.previous_value ?? 0),
  }));
}

/**
 * Decomposes the metric change by day-of-week. Uses EXTRACT(DOW)
 * from the business_date column in rm_daily_sales.
 */
async function decomposeByDayOfWeek(
  tenantId: string,
  column: string,
  currentRange: RootCauseDateRange,
  comparisonRange: RootCauseDateRange,
  locationId?: string,
): Promise<DimensionBreakdown[]> {
  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM business_date)::int AS dow,
      COALESCE(SUM(CASE
        WHEN business_date >= ${currentRange.start} AND business_date <= ${currentRange.end}
        THEN CAST(${sql.raw(column)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS current_value,
      COALESCE(SUM(CASE
        WHEN business_date >= ${comparisonRange.start} AND business_date <= ${comparisonRange.end}
        THEN CAST(${sql.raw(column)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS previous_value
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${comparisonRange.start}
      AND business_date <= ${currentRange.end}
      ${locationFilter}
    GROUP BY EXTRACT(DOW FROM business_date)
    ORDER BY EXTRACT(DOW FROM business_date)
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    dimensionValue: DOW_LABELS[Number(r.dow ?? 0)] ?? `Day ${r.dow}`,
    currentValue: Number(r.current_value ?? 0),
    previousValue: Number(r.previous_value ?? 0),
  }));
}

/**
 * Decomposes the metric change by item category using rm_item_sales.
 * Only applicable for revenue-type metrics (gross_revenue maps to net_sales,
 * quantity_sold maps to order_count). Falls back to empty if the metric
 * cannot be decomposed at item level.
 */
async function decomposeByItemCategory(
  tenantId: string,
  metricSlug: string,
  currentRange: RootCauseDateRange,
  comparisonRange: RootCauseDateRange,
  locationId?: string,
): Promise<DimensionBreakdown[]> {
  // Map metric slugs to rm_item_sales columns
  const itemMetricMap: Record<string, string> = {
    net_sales: 'gross_revenue',
    gross_sales: 'gross_revenue',
    order_count: 'quantity_sold',
  };

  const itemColumn = itemMetricMap[metricSlug];
  if (!itemColumn) return [];

  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      COALESCE(category_name, 'Uncategorized') AS dimension_value,
      COALESCE(SUM(CASE
        WHEN business_date >= ${currentRange.start} AND business_date <= ${currentRange.end}
        THEN CAST(${sql.raw(itemColumn)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS current_value,
      COALESCE(SUM(CASE
        WHEN business_date >= ${comparisonRange.start} AND business_date <= ${comparisonRange.end}
        THEN CAST(${sql.raw(itemColumn)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS previous_value
    FROM rm_item_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${comparisonRange.start}
      AND business_date <= ${currentRange.end}
      ${locationFilter}
    GROUP BY category_name
    ORDER BY ABS(
      COALESCE(SUM(CASE WHEN business_date >= ${currentRange.start} AND business_date <= ${currentRange.end} THEN CAST(${sql.raw(itemColumn)} AS DOUBLE PRECISION) ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN business_date >= ${comparisonRange.start} AND business_date <= ${comparisonRange.end} THEN CAST(${sql.raw(itemColumn)} AS DOUBLE PRECISION) ELSE 0 END), 0)
    ) DESC
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    dimensionValue: String(r.dimension_value ?? 'Uncategorized'),
    currentValue: Number(r.current_value ?? 0),
    previousValue: Number(r.previous_value ?? 0),
  }));
}

// ── Aggregated Totals ──────────────────────────────────────────────

async function fetchPeriodTotals(
  tenantId: string,
  column: string,
  currentRange: RootCauseDateRange,
  comparisonRange: RootCauseDateRange,
  locationId?: string,
): Promise<{ currentTotal: number; previousTotal: number }> {
  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE
        WHEN business_date >= ${currentRange.start} AND business_date <= ${currentRange.end}
        THEN CAST(${sql.raw(column)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS current_total,
      COALESCE(SUM(CASE
        WHEN business_date >= ${comparisonRange.start} AND business_date <= ${comparisonRange.end}
        THEN CAST(${sql.raw(column)} AS DOUBLE PRECISION)
        ELSE 0
      END), 0) AS previous_total
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= ${comparisonRange.start}
      AND business_date <= ${currentRange.end}
      ${locationFilter}
  `);

  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  return {
    currentTotal: Number(row?.current_total ?? 0),
    previousTotal: Number(row?.previous_total ?? 0),
  };
}

// ── Contributor Builder ────────────────────────────────────────────

function buildContributors(
  dimension: string,
  breakdowns: DimensionBreakdown[],
  totalChange: number,
  maxContributors: number,
): Contributor[] {
  const contributors: Contributor[] = breakdowns
    .map((b) => {
      const contribution = b.currentValue - b.previousValue;
      const contributionPct = totalChange !== 0
        ? (contribution / totalChange) * 100
        : 0;

      return {
        dimension,
        dimensionValue: b.dimensionValue,
        contribution: round2(contribution),
        contributionPct: round2(contributionPct),
        direction: classifyDirection(contribution),
        previousValue: round2(b.previousValue),
        currentValue: round2(b.currentValue),
      };
    })
    // Sort by absolute contribution descending
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return contributors.slice(0, maxContributors);
}

// ── Summary Generator ──────────────────────────────────────────────

function generateSummary(
  metricSlug: string,
  totalChange: number,
  changePct: number,
  topContributors: Contributor[],
): string {
  const metricLabel = metricSlug.replace(/_/g, ' ');
  const isCount = ['order_count', 'void_count'].includes(metricSlug);
  const direction = totalChange >= 0 ? 'increased' : 'decreased';

  const changeStr = isCount
    ? `${Math.abs(round2(totalChange))}`
    : formatDollars(Math.abs(totalChange));

  const parts: string[] = [
    `${metricLabel} ${direction} by ${changeStr} (${Math.abs(round2(changePct)).toFixed(1)}%).`,
  ];

  // Describe top contributor
  if (topContributors.length > 0) {
    const top = topContributors[0]!;
    const topDir = top.direction === 'positive' ? 'increase' : 'decrease';
    const topChangeStr = isCount
      ? `${Math.abs(top.contribution)}`
      : formatDollars(Math.abs(top.contribution));

    parts.push(
      `The biggest contributor was ${top.dimension}="${top.dimensionValue}" (${topDir} of ${topChangeStr}, ${Math.abs(top.contributionPct).toFixed(1)}% of total change).`,
    );
  }

  // Count positive vs negative contributors
  const positiveCount = topContributors.filter((c) => c.direction === 'positive').length;
  const negativeCount = topContributors.filter((c) => c.direction === 'negative').length;

  if (positiveCount > 0 && negativeCount > 0) {
    parts.push(
      `${positiveCount} factor${positiveCount > 1 ? 's' : ''} contributed positively while ${negativeCount} contributed negatively.`,
    );
  }

  return parts.join(' ');
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Analyzes why a metric changed between two time periods by decomposing
 * the total change across multiple dimensions.
 *
 * The analysis runs against reporting read models (`rm_daily_sales`,
 * `rm_item_sales`) and does not touch operational tables.
 *
 * Decomposition dimensions:
 * - **location**: Per-location contribution to the change.
 * - **day_of_week**: Which days of the week drove the change.
 * - **item_category**: Which product categories drove the change
 *   (only for revenue/count metrics that can map to `rm_item_sales`).
 *
 * @param tenantId - Tenant ID (required for multi-tenant isolation).
 * @param metricSlug - The metric slug to analyze (e.g., 'net_sales', 'order_count').
 * @param dateRange - The period to analyze.
 * @param options - Optional configuration (location filter, comparison range, max contributors).
 * @returns Root cause result with ranked contributors and a text summary.
 */
export async function analyzeRootCause(
  tenantId: string,
  metricSlug: string,
  dateRange: RootCauseDateRange,
  options: RootCauseOptions = {},
): Promise<RootCauseResult> {
  const {
    locationId,
    maxContributors = DEFAULT_MAX_CONTRIBUTORS,
    comparisonRange: customComparisonRange,
  } = options;

  // Resolve the metric column
  const column = resolveColumn(metricSlug);
  if (!column) {
    return {
      metric: metricSlug,
      totalChange: 0,
      changePct: 0,
      currentTotal: 0,
      previousTotal: 0,
      contributors: [],
      summary: `Unknown metric "${metricSlug}". Supported metrics: ${Object.keys(METRIC_COLUMN_MAP).join(', ')}.`,
    };
  }

  // Determine comparison range
  const comparisonRange = customComparisonRange ?? computeComparisonRange(dateRange);

  // Step 1: Fetch aggregate totals for both periods
  const { currentTotal, previousTotal } = await fetchPeriodTotals(
    tenantId,
    column,
    dateRange,
    comparisonRange,
    locationId,
  );

  const totalChange = round2(currentTotal - previousTotal);
  const changePct = previousTotal !== 0
    ? round2(((currentTotal - previousTotal) / Math.abs(previousTotal)) * 100)
    : currentTotal !== 0 ? 100 : 0;

  // If there is no change, return early
  if (Math.abs(totalChange) < 0.01) {
    return {
      metric: metricSlug,
      totalChange: 0,
      changePct: 0,
      currentTotal: round2(currentTotal),
      previousTotal: round2(previousTotal),
      contributors: [],
      summary: `${metricSlug.replace(/_/g, ' ')} showed no significant change between the two periods.`,
    };
  }

  // Step 2: Decompose by all available dimensions in parallel
  const [locationBreakdowns, dowBreakdowns, categoryBreakdowns] = await Promise.all([
    // Skip location decomposition if already filtered to a single location
    locationId
      ? Promise.resolve([])
      : decomposeByLocation(tenantId, column, dateRange, comparisonRange, locationId),
    decomposeByDayOfWeek(tenantId, column, dateRange, comparisonRange, locationId),
    decomposeByItemCategory(tenantId, metricSlug, dateRange, comparisonRange, locationId),
  ]);

  // Step 3: Build and rank contributors across all dimensions
  const allContributors: Contributor[] = [
    ...buildContributors('location', locationBreakdowns, totalChange, maxContributors),
    ...buildContributors('day_of_week', dowBreakdowns, totalChange, maxContributors),
    ...buildContributors('item_category', categoryBreakdowns, totalChange, maxContributors),
  ];

  // Sort all contributors by absolute contribution descending and take top N
  allContributors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const topContributors = allContributors.slice(0, maxContributors);

  // Step 4: Generate summary text
  const summary = generateSummary(metricSlug, totalChange, changePct, topContributors);

  return {
    metric: metricSlug,
    totalChange,
    changePct,
    currentTotal: round2(currentTotal),
    previousTotal: round2(previousTotal),
    contributors: topContributors,
    summary,
  };
}
