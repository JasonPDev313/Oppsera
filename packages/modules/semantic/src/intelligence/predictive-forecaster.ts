// ── Predictive Forecaster ─────────────────────────────────────────
// Simple trend extrapolation with confidence intervals. Supports
// three methods: linear regression (OLS), simple moving average,
// and exponential smoothing. Forecasts are computed from rm_daily_sales
// historical data using PostgreSQL aggregate functions where possible
// and lightweight in-process math otherwise.

import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────

export type ForecastMethod = 'linear' | 'moving_average' | 'exponential_smoothing';

export type TrendDirection = 'up' | 'down' | 'flat';

export interface DataPoint {
  /** Business date (YYYY-MM-DD). */
  date: string;
  /** Observed metric value. */
  value: number;
}

export interface ForecastPoint {
  /** Forecast date (YYYY-MM-DD). */
  date: string;
  /** Predicted value at this date. */
  predicted: number;
  /** Upper bound of the confidence interval. */
  upperBound: number;
  /** Lower bound of the confidence interval. */
  lowerBound: number;
  /**
   * Confidence score for this prediction (0-100).
   * Decreases as the forecast extends further from the historical data.
   */
  confidence: number;
}

export interface ForecastOptions {
  /** Number of trailing days of historical data to use (default: 90). */
  historyDays?: number;
  /** Number of days to forecast into the future (default: 30). */
  forecastDays?: number;
  /** Forecasting method (default: 'linear'). */
  method?: ForecastMethod;
  /** Location filter. If omitted, aggregates all locations per day. */
  locationId?: string;
  /**
   * Smoothing factor for exponential smoothing (0-1, default: 0.3).
   * Higher values weigh recent observations more heavily.
   */
  alpha?: number;
  /** Moving average window size in days (default: 7). */
  maWindow?: number;
}

export interface ForecastResult {
  /** The metric that was forecast. */
  metric: string;
  /** Historical daily data points used for the forecast. */
  historicalData: DataPoint[];
  /** Projected future data points with confidence intervals. */
  forecastData: ForecastPoint[];
  /** Overall trend direction based on the model. */
  trend: TrendDirection;
  /**
   * Strength of the trend (0-1). For linear: |r|.
   * For MA/ES: based on slope of the smoothed series.
   */
  trendStrength: number;
  /** Which method was used for the forecast. */
  methodology: string;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_HISTORY_DAYS = 90;
const DEFAULT_FORECAST_DAYS = 30;
const DEFAULT_ALPHA = 0.3;
const DEFAULT_MA_WINDOW = 7;

/** Threshold for classifying trend as flat (daily slope as fraction of mean). */
const FLAT_THRESHOLD = 0.001;

/**
 * Maps metric slugs to their column name in `rm_daily_sales`.
 * All monetary columns store dollars as NUMERIC(19,4).
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

// ── Helpers ────────────────────────────────────────────────────────

function resolveColumn(metricSlug: string): string | null {
  return METRIC_COLUMN_MAP[metricSlug] ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
}

/**
 * Classifies trend direction based on slope relative to mean.
 * A slope that changes less than 0.1% of the mean per day is considered flat.
 */
function classifyTrend(slope: number, mean: number): TrendDirection {
  if (mean === 0) return 'flat';
  const relativeSlopePerDay = Math.abs(slope) / Math.abs(mean);
  if (relativeSlopePerDay < FLAT_THRESHOLD) return 'flat';
  return slope > 0 ? 'up' : 'down';
}

// ── Data Fetcher ───────────────────────────────────────────────────

/**
 * Fetches historical daily values for a metric, aggregated across
 * locations (unless filtered). Returns data points sorted by date ascending.
 */
async function fetchHistoricalData(
  tenantId: string,
  column: string,
  historyDays: number,
  locationId?: string,
): Promise<DataPoint[]> {
  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      business_date,
      COALESCE(SUM(CAST(${sql.raw(column)} AS DOUBLE PRECISION)), 0) AS value
    FROM rm_daily_sales
    WHERE tenant_id = ${tenantId}
      AND business_date >= CURRENT_DATE - ${historyDays}::int
      AND business_date <= CURRENT_DATE
      ${locationFilter}
    GROUP BY business_date
    ORDER BY business_date ASC
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    date: String(r.business_date),
    value: Number(r.value ?? 0),
  }));
}

/**
 * Uses PostgreSQL's built-in regr_slope() and regr_intercept() to
 * compute OLS linear regression parameters server-side. Also returns
 * the correlation coefficient via corr() and residual standard error.
 */
async function fetchLinearRegressionParams(
  tenantId: string,
  column: string,
  historyDays: number,
  locationId?: string,
): Promise<{
  slope: number;
  intercept: number;
  correlation: number;
  residualStdErr: number;
  mean: number;
  n: number;
} | null> {
  const locationFilter = locationId
    ? sql`AND location_id = ${locationId}`
    : sql``;

  const rows = await db.execute(sql`
    WITH daily_agg AS (
      SELECT
        business_date,
        EXTRACT(EPOCH FROM (business_date - (CURRENT_DATE - ${historyDays}::int))) / 86400.0 AS x,
        COALESCE(SUM(CAST(${sql.raw(column)} AS DOUBLE PRECISION)), 0) AS y
      FROM rm_daily_sales
      WHERE tenant_id = ${tenantId}
        AND business_date >= CURRENT_DATE - ${historyDays}::int
        AND business_date <= CURRENT_DATE
        ${locationFilter}
      GROUP BY business_date
    )
    SELECT
      regr_slope(y, x) AS slope,
      regr_intercept(y, x) AS intercept,
      corr(y, x) AS correlation,
      COALESCE(STDDEV_SAMP(y - (regr_slope(y, x) * x + regr_intercept(y, x))), 0) AS residual_std_err,
      AVG(y) AS mean,
      COUNT(*) AS n
    FROM daily_agg
  `);

  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!row) return null;

  const slope = Number(row.slope ?? 0);
  const intercept = Number(row.intercept ?? 0);
  const n = Number(row.n ?? 0);

  if (n < 3 || isNaN(slope) || isNaN(intercept)) return null;

  return {
    slope,
    intercept,
    correlation: Number(row.correlation ?? 0),
    residualStdErr: Number(row.residual_std_err ?? 0),
    mean: Number(row.mean ?? 0),
    n,
  };
}

// ── Forecast Methods ───────────────────────────────────────────────

/**
 * Linear regression forecast via Ordinary Least Squares.
 * Uses PostgreSQL regr_slope()/regr_intercept() for the model,
 * then extrapolates with widening confidence bands.
 */
async function forecastLinear(
  tenantId: string,
  column: string,
  historicalData: DataPoint[],
  historyDays: number,
  forecastDays: number,
  locationId?: string,
): Promise<{ forecastData: ForecastPoint[]; trend: TrendDirection; trendStrength: number; methodology: string }> {
  const params = await fetchLinearRegressionParams(tenantId, column, historyDays, locationId);

  if (!params) {
    return {
      forecastData: [],
      trend: 'flat',
      trendStrength: 0,
      methodology: 'linear regression (insufficient data)',
    };
  }

  const { slope, intercept, correlation, residualStdErr, mean, n } = params;
  const lastDate = historicalData.length > 0
    ? historicalData[historicalData.length - 1]!.date
    : new Date().toISOString().split('T')[0]!;

  // x-offset for the last historical date (days since start of history window)
  const xBase = historyDays;

  const forecastData: ForecastPoint[] = [];

  for (let i = 1; i <= forecastDays; i++) {
    const date = addDays(lastDate, i);
    const x = xBase + i;
    const predicted = slope * x + intercept;

    // Confidence interval widens with distance from the mean of x values.
    // Use a simplified prediction interval: predicted +/- t * SE * sqrt(1 + 1/n + (x - x_mean)^2 / Sxx)
    // Simplified as: residualStdErr * widening factor
    const wideningFactor = Math.sqrt(1 + 1 / n + (i * i) / (n * historyDays));
    const margin = 1.96 * residualStdErr * wideningFactor; // ~95% CI

    // Confidence degrades linearly with forecast horizon
    const confidence = Math.max(
      10,
      Math.round(95 - (i / forecastDays) * 60),
    );

    forecastData.push({
      date,
      predicted: round2(Math.max(0, predicted)),
      upperBound: round2(Math.max(0, predicted + margin)),
      lowerBound: round2(Math.max(0, predicted - margin)),
      confidence,
    });
  }

  return {
    forecastData,
    trend: classifyTrend(slope, mean),
    trendStrength: round2(Math.abs(correlation)),
    methodology: `Linear regression (OLS): y = ${round2(slope)}x + ${round2(intercept)}, r = ${round2(correlation)}`,
  };
}

/**
 * Simple Moving Average forecast. Projects the last window-average
 * forward with confidence based on historical variance within the window.
 */
function forecastMovingAverage(
  historicalData: DataPoint[],
  forecastDays: number,
  windowSize: number,
): { forecastData: ForecastPoint[]; trend: TrendDirection; trendStrength: number; methodology: string } {
  if (historicalData.length < windowSize) {
    return {
      forecastData: [],
      trend: 'flat',
      trendStrength: 0,
      methodology: `Moving average (insufficient data, need ${windowSize} days)`,
    };
  }

  // Compute the last moving average
  const recentWindow = historicalData.slice(-windowSize);
  const windowValues = recentWindow.map((d) => d.value);
  const lastMa = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;

  // Compute standard deviation within the window for confidence bands
  const variance = windowValues.reduce((sum, v) => sum + (v - lastMa) ** 2, 0) / windowValues.length;
  const stdDev = Math.sqrt(variance);

  // Compute trend from the slope of moving averages over the last 4 windows
  const maSlope = computeMaSlope(historicalData, windowSize);

  const lastDate = historicalData[historicalData.length - 1]!.date;
  const overallMean = historicalData.reduce((s, d) => s + d.value, 0) / historicalData.length;

  const forecastData: ForecastPoint[] = [];

  for (let i = 1; i <= forecastDays; i++) {
    const date = addDays(lastDate, i);
    // Project the average forward, optionally with trend drift
    const predicted = lastMa + maSlope * i;

    // Confidence band widens with horizon
    const wideningFactor = Math.sqrt(1 + i / windowSize);
    const margin = 1.96 * stdDev * wideningFactor;

    const confidence = Math.max(10, Math.round(85 - (i / forecastDays) * 55));

    forecastData.push({
      date,
      predicted: round2(Math.max(0, predicted)),
      upperBound: round2(Math.max(0, predicted + margin)),
      lowerBound: round2(Math.max(0, predicted - margin)),
      confidence,
    });
  }

  return {
    forecastData,
    trend: classifyTrend(maSlope, overallMean),
    trendStrength: round2(Math.min(1, Math.abs(maSlope) / (overallMean * FLAT_THRESHOLD * 10 || 1))),
    methodology: `${windowSize}-day simple moving average (SMA): last MA = ${round2(lastMa)}, slope = ${round2(maSlope)}/day`,
  };
}

/**
 * Computes the slope of the moving average series over the most
 * recent windows to detect trend in the smoothed data.
 */
function computeMaSlope(data: DataPoint[], windowSize: number): number {
  const numWindows = Math.min(4, Math.floor(data.length / windowSize));
  if (numWindows < 2) return 0;

  const maValues: number[] = [];
  for (let w = 0; w < numWindows; w++) {
    const startIdx = data.length - (numWindows - w) * windowSize;
    const endIdx = startIdx + windowSize;
    const windowSlice = data.slice(Math.max(0, startIdx), endIdx);
    if (windowSlice.length === 0) continue;
    const avg = windowSlice.reduce((s, d) => s + d.value, 0) / windowSlice.length;
    maValues.push(avg);
  }

  if (maValues.length < 2) return 0;

  // Simple linear regression on the MA values (x = window index)
  const n = maValues.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += maValues[i]!;
    sumXY += i * maValues[i]!;
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  // Slope per window-width, converted to per-day
  const slopePerWindow = (n * sumXY - sumX * sumY) / denom;
  return slopePerWindow / windowSize;
}

/**
 * Simple Exponential Smoothing (SES). Applies an exponential decay
 * to historical observations and projects the smoothed level forward.
 */
function forecastExponentialSmoothing(
  historicalData: DataPoint[],
  forecastDays: number,
  alpha: number,
): { forecastData: ForecastPoint[]; trend: TrendDirection; trendStrength: number; methodology: string } {
  if (historicalData.length < 3) {
    return {
      forecastData: [],
      trend: 'flat',
      trendStrength: 0,
      methodology: 'Exponential smoothing (insufficient data)',
    };
  }

  // Apply SES to compute the final smoothed level
  let level = historicalData[0]!.value;
  const residuals: number[] = [];

  for (let i = 1; i < historicalData.length; i++) {
    const observed = historicalData[i]!.value;
    const previousLevel = level;
    level = alpha * observed + (1 - alpha) * level;
    residuals.push(observed - previousLevel);
  }

  // Compute residual standard deviation for confidence bands
  const residualMean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const residualVariance = residuals.reduce((s, r) => s + (r - residualMean) ** 2, 0) / residuals.length;
  const residualStdDev = Math.sqrt(residualVariance);

  // Estimate trend from the last few levels
  const recentLevels: number[] = [];
  let tempLevel = historicalData[0]!.value;
  for (let i = 1; i < historicalData.length; i++) {
    tempLevel = alpha * historicalData[i]!.value + (1 - alpha) * tempLevel;
    if (i >= historicalData.length - 14) {
      recentLevels.push(tempLevel);
    }
  }

  const trendSlope = recentLevels.length >= 2
    ? (recentLevels[recentLevels.length - 1]! - recentLevels[0]!) / recentLevels.length
    : 0;

  const overallMean = historicalData.reduce((s, d) => s + d.value, 0) / historicalData.length;
  const lastDate = historicalData[historicalData.length - 1]!.date;

  const forecastData: ForecastPoint[] = [];

  for (let i = 1; i <= forecastDays; i++) {
    const date = addDays(lastDate, i);
    // SES projects the last level forward (flat); we add a small trend drift
    const predicted = level + trendSlope * i;

    // SES confidence band widening factor
    // For SES: Var(h-step-ahead) = sigma^2 * (1 + (h-1) * alpha^2)
    const varianceFactor = 1 + (i - 1) * alpha * alpha;
    const margin = 1.96 * residualStdDev * Math.sqrt(varianceFactor);

    const confidence = Math.max(10, Math.round(90 - (i / forecastDays) * 55));

    forecastData.push({
      date,
      predicted: round2(Math.max(0, predicted)),
      upperBound: round2(Math.max(0, predicted + margin)),
      lowerBound: round2(Math.max(0, predicted - margin)),
      confidence,
    });
  }

  return {
    forecastData,
    trend: classifyTrend(trendSlope, overallMean),
    trendStrength: round2(Math.min(1, Math.abs(trendSlope) / (overallMean * FLAT_THRESHOLD * 10 || 1))),
    methodology: `Simple exponential smoothing (alpha=${alpha}): level = ${round2(level)}, residual SE = ${round2(residualStdDev)}`,
  };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Generates a time-series forecast for a metric based on historical
 * data from `rm_daily_sales`.
 *
 * Supports three methods:
 * - **linear**: Ordinary Least Squares regression. Best for metrics with
 *   a clear long-term trend. Uses PostgreSQL `regr_slope()` and
 *   `regr_intercept()` for server-side computation.
 * - **moving_average**: 7-day (configurable) simple moving average.
 *   Best for metrics with high daily variance but stable weekly patterns.
 * - **exponential_smoothing**: Simple Exponential Smoothing with
 *   configurable alpha. Best for metrics with recent-change momentum.
 *
 * All methods produce confidence intervals that widen as the forecast
 * horizon extends. Confidence scores decrease proportionally.
 *
 * @param tenantId - Tenant ID (required for multi-tenant isolation).
 * @param metricSlug - The metric slug to forecast (e.g., 'net_sales').
 * @param options - Optional configuration (history, horizon, method, location).
 * @returns Forecast result with historical data, predictions, and trend classification.
 */
export async function generateForecast(
  tenantId: string,
  metricSlug: string,
  options: ForecastOptions = {},
): Promise<ForecastResult> {
  const {
    historyDays = DEFAULT_HISTORY_DAYS,
    forecastDays = DEFAULT_FORECAST_DAYS,
    method = 'linear',
    locationId,
    alpha = DEFAULT_ALPHA,
    maWindow = DEFAULT_MA_WINDOW,
  } = options;

  // Validate the metric
  const column = resolveColumn(metricSlug);
  if (!column) {
    return {
      metric: metricSlug,
      historicalData: [],
      forecastData: [],
      trend: 'flat',
      trendStrength: 0,
      methodology: `Unknown metric "${metricSlug}". Supported: ${Object.keys(METRIC_COLUMN_MAP).join(', ')}.`,
    };
  }

  // Fetch historical data
  const historicalData = await fetchHistoricalData(tenantId, column, historyDays, locationId);

  if (historicalData.length < 3) {
    return {
      metric: metricSlug,
      historicalData,
      forecastData: [],
      trend: 'flat',
      trendStrength: 0,
      methodology: `Insufficient historical data (${historicalData.length} days). Need at least 3 days.`,
    };
  }

  // Run the selected forecasting method
  let result: { forecastData: ForecastPoint[]; trend: TrendDirection; trendStrength: number; methodology: string };

  switch (method) {
    case 'linear':
      result = await forecastLinear(tenantId, column, historicalData, historyDays, forecastDays, locationId);
      break;
    case 'moving_average':
      result = forecastMovingAverage(historicalData, forecastDays, maWindow);
      break;
    case 'exponential_smoothing':
      result = forecastExponentialSmoothing(historicalData, forecastDays, alpha);
      break;
    default:
      result = await forecastLinear(tenantId, column, historicalData, historyDays, forecastDays, locationId);
  }

  return {
    metric: metricSlug,
    historicalData,
    ...result,
  };
}
