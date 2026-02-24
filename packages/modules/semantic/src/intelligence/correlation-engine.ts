// ── Correlation Engine ─────────────────────────────────────────────
// Statistical correlation discovery across metrics. Given a target
// metric, computes Pearson correlation coefficients against all other
// available metrics using rm_daily_sales data. Uses PostgreSQL's
// built-in corr() aggregate for efficient server-side computation.

import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────

export type CorrelationStrength = 'strong' | 'moderate' | 'weak' | 'negligible';

export type CorrelationDirection = 'positive' | 'negative';

export interface MetricCorrelation {
  /** Slug of the correlated metric. */
  metricSlug: string;
  /** Human-readable display name. */
  displayName: string;
  /** Pearson correlation coefficient (range: -1 to 1). */
  pearsonR: number;
  /** Classified strength of the correlation. */
  strength: CorrelationStrength;
  /** Whether the correlation is positive or negative. */
  direction: CorrelationDirection;
  /** Number of data points (days) used in the computation. */
  sampleSize: number;
  /**
   * Approximate p-value via t-distribution approximation.
   * Lower values indicate stronger statistical significance.
   * null when sample size is too small for meaningful computation.
   */
  pValue: number | null;
}

export interface CorrelationOptions {
  /** Number of trailing days to analyze (default: 90). */
  periodDays?: number;
  /** Location filter. If omitted, aggregates all locations per day. */
  locationId?: string;
  /** Minimum sample size (days) required for a valid correlation (default: 14). */
  minSampleSize?: number;
  /** Minimum absolute |r| to include in results (default: 0.1). */
  minAbsR?: number;
}

export interface CorrelationResult {
  /** The target metric that was correlated against. */
  targetMetric: string;
  /** The period analyzed (YYYY-MM-DD start and end). */
  period: {
    start: string;
    end: string;
    days: number;
  };
  /** Correlations ranked by absolute |r| descending. */
  correlations: MetricCorrelation[];
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_PERIOD_DAYS = 90;
const DEFAULT_MIN_SAMPLE_SIZE = 14;
const DEFAULT_MIN_ABS_R = 0.1;

/**
 * Metrics available for correlation analysis in rm_daily_sales.
 * Each key is the metric slug; value is { column, displayName }.
 */
const AVAILABLE_METRICS: Record<string, { column: string; displayName: string }> = {
  net_sales: { column: 'net_sales', displayName: 'Net Sales' },
  gross_sales: { column: 'gross_sales', displayName: 'Gross Sales' },
  order_count: { column: 'order_count', displayName: 'Order Count' },
  avg_order_value: { column: 'avg_order_value', displayName: 'Avg Order Value' },
  discount_total: { column: 'discount_total', displayName: 'Discounts' },
  tax_total: { column: 'tax_total', displayName: 'Tax Total' },
  void_count: { column: 'void_count', displayName: 'Void Count' },
  void_total: { column: 'void_total', displayName: 'Void Total' },
  tender_cash: { column: 'tender_cash', displayName: 'Cash Tenders' },
  tender_card: { column: 'tender_card', displayName: 'Card Tenders' },
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Classifies the Pearson r value into a strength category.
 *
 * Thresholds follow standard statistical conventions:
 * - |r| >= 0.7 : strong
 * - |r| >= 0.4 : moderate
 * - |r| >= 0.2 : weak
 * - |r| <  0.2 : negligible
 */
function classifyStrength(absR: number): CorrelationStrength {
  if (absR >= 0.7) return 'strong';
  if (absR >= 0.4) return 'moderate';
  if (absR >= 0.2) return 'weak';
  return 'negligible';
}

/**
 * Approximates the p-value for a Pearson correlation using the
 * t-distribution. The t-statistic is:
 *
 *   t = r * sqrt((n - 2) / (1 - r^2))
 *
 * The p-value is then approximated using a rational approximation
 * of the two-tailed cumulative t-distribution.
 *
 * For production rigor this would use a proper stats library, but
 * for a lightweight indicator this approximation is sufficient.
 */
function approximatePValue(r: number, n: number): number | null {
  if (n < 4) return null; // Insufficient data for meaningful p-value
  if (Math.abs(r) >= 1) return 0; // Perfect correlation

  const rSquared = r * r;
  const df = n - 2;
  const tStat = Math.abs(r) * Math.sqrt(df / (1 - rSquared));

  // Approximate two-tailed p-value via the incomplete beta function
  // Using a standard rational approximation for the t-distribution CDF
  return approximateTwoTailedP(tStat, df);
}

/**
 * Rational approximation for the two-tailed p-value of a t-distribution.
 * Uses the Abramowitz & Stegun approximation (26.2.17) for the normal CDF
 * applied to the t-distribution via the large-df normal approximation.
 *
 * Accurate to within ~0.01 for df >= 10, which is acceptable for our
 * use case of flagging statistical significance, not for publication.
 */
function approximateTwoTailedP(t: number, df: number): number {
  // For large df, t ≈ z (normal). Use the approximation:
  // z ≈ t * (1 - 1/(4*df)) / sqrt(1 + t^2/(2*df))
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + (t * t) / (2 * df));

  // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
  const absZ = Math.abs(z);
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const tVal = 1 / (1 + p * absZ);
  const tPow2 = tVal * tVal;
  const tPow3 = tPow2 * tVal;
  const tPow4 = tPow3 * tVal;
  const tPow5 = tPow4 * tVal;

  const phi = Math.exp(-absZ * absZ / 2) / Math.sqrt(2 * Math.PI);
  const oneTailP = phi * (b1 * tVal + b2 * tPow2 + b3 * tPow3 + b4 * tPow4 + b5 * tPow5);

  // Two-tailed p-value, clamped to [0, 1]
  return Math.max(0, Math.min(1, 2 * oneTailP));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Core Query ─────────────────────────────────────────────────────

/**
 * Uses PostgreSQL's built-in `corr()` aggregate function to compute
 * pairwise Pearson correlations between the target metric and all
 * candidate metrics in a single query. Data is pre-aggregated by
 * business_date (summing across locations when no location filter is set).
 */
async function computeCorrelationsViaSql(
  tenantId: string,
  targetSlug: string,
  periodStart: string,
  periodEnd: string,
  locationId?: string,
): Promise<Array<{ slug: string; r: number; n: number }>> {
  const targetMeta = AVAILABLE_METRICS[targetSlug];
  if (!targetMeta) return [];

  const targetColumn = targetMeta.column;

  // Build the candidate metric columns (everything except the target)
  const candidateSlugs = Object.keys(AVAILABLE_METRICS).filter((s) => s !== targetSlug);
  if (candidateSlugs.length === 0) return [];

  // Build corr() expressions for each candidate
  const corrExpressions = candidateSlugs.map((slug) => {
    const col = AVAILABLE_METRICS[slug]!.column;
    return sql.raw(
      `corr(target_val, CAST(${col}_val AS DOUBLE PRECISION)) AS "r_${slug}"`
    );
  });

  // Build the aggregate select expressions for the CTE
  const aggExpressions = candidateSlugs.map((slug) => {
    const col = AVAILABLE_METRICS[slug]!.column;
    return sql.raw(
      `SUM(CAST(${col} AS DOUBLE PRECISION)) AS "${col}_val"`
    );
  });

  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  // Single query: CTE aggregates by business_date, then corr() across days
  const query = sql`
    WITH daily_agg AS (
      SELECT
        business_date,
        SUM(CAST(${sql.raw(targetColumn)} AS DOUBLE PRECISION)) AS target_val,
        ${sql.join(aggExpressions, sql.raw(','))}
      FROM rm_daily_sales
      WHERE tenant_id = ${tenantId}
        AND business_date >= ${periodStart}
        AND business_date <= ${periodEnd}
        ${locationFilter}
      GROUP BY business_date
    )
    SELECT
      COUNT(*) AS sample_size,
      ${sql.join(corrExpressions, sql.raw(','))}
    FROM daily_agg
  `;

  const resultRows = await db.execute(query);
  const row = Array.from(resultRows as Iterable<Record<string, unknown>>)[0];
  if (!row) return [];

  const sampleSize = Number(row.sample_size ?? 0);

  return candidateSlugs.map((slug) => ({
    slug,
    r: Number(row[`r_${slug}`] ?? 0),
    n: sampleSize,
  }));
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Discovers statistical correlations between a target metric and all
 * other available metrics in `rm_daily_sales`.
 *
 * The engine aggregates daily values across locations (unless a location
 * filter is set), then uses PostgreSQL's `corr()` aggregate to compute
 * Pearson correlation coefficients in a single server-side query.
 *
 * Results are ranked by absolute |r| descending and include an
 * approximate p-value for significance assessment.
 *
 * @param tenantId - Tenant ID (required for multi-tenant isolation).
 * @param targetMetricSlug - The metric to correlate against (e.g., 'net_sales').
 * @param options - Optional configuration (period, location, thresholds).
 * @returns Correlation result with ranked metric pairs.
 */
export async function discoverCorrelations(
  tenantId: string,
  targetMetricSlug: string,
  options: CorrelationOptions = {},
): Promise<CorrelationResult> {
  const {
    periodDays = DEFAULT_PERIOD_DAYS,
    locationId,
    minSampleSize = DEFAULT_MIN_SAMPLE_SIZE,
    minAbsR = DEFAULT_MIN_ABS_R,
  } = options;

  // Validate the target metric
  const targetMeta = AVAILABLE_METRICS[targetMetricSlug];
  if (!targetMeta) {
    return {
      targetMetric: targetMetricSlug,
      period: { start: '', end: '', days: 0 },
      correlations: [],
    };
  }

  // Compute date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const periodStart = startDate.toISOString().split('T')[0]!;
  const periodEnd = endDate.toISOString().split('T')[0]!;

  // Run the correlation query
  const rawCorrelations = await computeCorrelationsViaSql(
    tenantId,
    targetMetricSlug,
    periodStart,
    periodEnd,
    locationId,
  );

  // Filter and transform results
  const correlations: MetricCorrelation[] = rawCorrelations
    .filter((c) => {
      // Exclude NaN correlations (e.g., when a column is constant)
      if (isNaN(c.r)) return false;
      // Enforce minimum sample size
      if (c.n < minSampleSize) return false;
      // Enforce minimum absolute correlation
      if (Math.abs(c.r) < minAbsR) return false;
      return true;
    })
    .map((c) => {
      const meta = AVAILABLE_METRICS[c.slug]!;
      const absR = Math.abs(c.r);
      const pearsonR = round4(c.r);

      return {
        metricSlug: c.slug,
        displayName: meta.displayName,
        pearsonR,
        strength: classifyStrength(absR),
        direction: c.r >= 0 ? 'positive' as CorrelationDirection : 'negative' as CorrelationDirection,
        sampleSize: c.n,
        pValue: approximatePValue(c.r, c.n),
      };
    })
    // Sort by absolute |r| descending
    .sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR));

  return {
    targetMetric: targetMetricSlug,
    period: {
      start: periodStart,
      end: periodEnd,
      days: periodDays,
    },
    correlations,
  };
}
