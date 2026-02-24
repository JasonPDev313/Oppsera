import type { ChartConfig, QueryResult } from '../llm/types';
import type { QueryPlan, CompiledQuery } from '../compiler/types';

// ── Chart type inference ─────────────────────────────────────────
// Pure function: no DB access, no side effects.
// Infers the best chart type from the query plan, compiled query, and result set.

/** Known date-like dimension slugs */
const DATE_DIMENSIONS = new Set([
  'date', 'business_date', 'week', 'month', 'quarter', 'year',
  'order_date', 'transaction_date', 'created_date',
]);

/** Known category-like dimension slugs */
const CATEGORY_DIMENSIONS = new Set([
  'category', 'sub_department', 'department', 'item_name', 'item',
  'location', 'location_name', 'payment_type', 'tender_type',
  'vendor', 'customer', 'server', 'station',
]);

/** Metric slugs that represent monetary values */
const CURRENCY_METRICS = new Set([
  'net_sales', 'gross_sales', 'total_revenue', 'revenue',
  'avg_order_value', 'total_cost', 'cogs', 'profit',
  'total_spend', 'average_spend', 'discount_total',
  'tip_total', 'tax_total',
]);

/** Metric slugs that represent percentages */
const PERCENT_METRICS = new Set([
  'margin', 'profit_margin', 'discount_rate', 'void_rate',
  'utilization', 'occupancy', 'sell_through_rate',
  'tip_percentage',
]);

function inferYFormat(metricSlugs: string[]): ChartConfig['yFormat'] {
  if (metricSlugs.some((s) => CURRENCY_METRICS.has(s))) return 'currency';
  if (metricSlugs.some((s) => PERCENT_METRICS.has(s))) return 'percent';
  return 'number';
}

function findDateDimension(dimensions: string[]): string | undefined {
  return dimensions.find((d) => DATE_DIMENSIONS.has(d));
}

function findCategoryDimension(dimensions: string[]): string | undefined {
  return dimensions.find((d) => CATEGORY_DIMENSIONS.has(d));
}

/**
 * Infer the best chart configuration from query plan, compiled output, and result set.
 *
 * Rules (in priority order):
 * 1. Single metric, no dimensions -> metric_card
 * 2. Result has 1-3 rows -> metric_card
 * 3. Plan has date dimension -> line chart
 * 4. Plan has category/item dimension without date -> bar chart
 * 5. Comparing two periods -> comparison chart
 * 6. Many rows (>20) -> table
 * 7. Default -> bar chart for small result sets, table for large ones
 *
 * Returns null when no reasonable chart type can be determined.
 */
export function inferChartConfig(
  plan: QueryPlan,
  compiled: CompiledQuery,
  result: QueryResult | null,
): ChartConfig | null {
  const { metrics, dimensions } = plan;

  // No metrics at all -> can't chart
  if (!metrics || metrics.length === 0) return null;

  const rowCount = result?.rowCount ?? 0;
  const dateDim = findDateDimension(dimensions);
  const categoryDim = findCategoryDimension(dimensions);
  const yFormat = inferYFormat(metrics);

  // Derive column names from compiled output when available
  const metricColumnNames = compiled.metaDefs.map((m) => m.slug);
  const yAxisColumns = metricColumnNames.length > 0 ? metricColumnNames : metrics;

  // Rule 1: Single metric with no dimensions -> metric_card
  if (dimensions.length === 0 && metrics.length <= 2) {
    return {
      type: 'metric_card',
      yAxis: yAxisColumns,
      title: compiled.metaDefs[0]?.displayName ?? metrics[0],
      yFormat,
    };
  }

  // Rule 2: Very small result set (1-3 rows) -> metric_card
  if (rowCount >= 1 && rowCount <= 3 && !dateDim) {
    return {
      type: 'metric_card',
      xAxis: categoryDim ?? dimensions[0],
      yAxis: yAxisColumns,
      title: compiled.metaDefs[0]?.displayName ?? metrics[0],
      yFormat,
    };
  }

  // Rule 3: Has a date dimension -> line chart
  if (dateDim) {
    return {
      type: 'line',
      xAxis: dateDim,
      yAxis: yAxisColumns,
      xLabel: dateDim.replace(/_/g, ' '),
      yLabel: compiled.metaDefs[0]?.displayName ?? metrics[0],
      yFormat,
    };
  }

  // Rule 4: Comparing two periods (dateRange filter with timeGranularity)
  if (plan.dateRange && plan.timeGranularity && metrics.length >= 1) {
    // If the plan explicitly compares granularities, use comparison
    if (plan.timeGranularity === 'month' || plan.timeGranularity === 'quarter') {
      return {
        type: 'comparison',
        xAxis: plan.timeGranularity,
        yAxis: yAxisColumns,
        yFormat,
        comparisonLabel: `By ${plan.timeGranularity}`,
      };
    }
  }

  // Rule 5: Category dimension without date -> bar chart
  if (categoryDim) {
    // Too many categories -> table
    if (rowCount > 20) {
      return {
        type: 'table',
        xAxis: categoryDim,
        yAxis: yAxisColumns,
        yFormat,
      };
    }

    return {
      type: 'bar',
      xAxis: categoryDim,
      yAxis: yAxisColumns,
      xLabel: categoryDim.replace(/_/g, ' '),
      yLabel: compiled.metaDefs[0]?.displayName ?? metrics[0],
      yFormat,
    };
  }

  // Rule 6: Many rows -> table
  if (rowCount > 20) {
    return {
      type: 'table',
      xAxis: dimensions[0],
      yAxis: yAxisColumns,
      yFormat,
    };
  }

  // Rule 7: Small result set with a non-date, non-category dimension -> bar
  if (dimensions.length > 0 && rowCount > 0) {
    return {
      type: 'bar',
      xAxis: dimensions[0],
      yAxis: yAxisColumns,
      xLabel: dimensions[0]!.replace(/_/g, ' '),
      yLabel: compiled.metaDefs[0]?.displayName ?? metrics[0],
      yFormat,
    };
  }

  return null;
}
