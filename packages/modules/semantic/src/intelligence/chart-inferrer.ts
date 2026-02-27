import type { ChartConfig, QueryResult } from '../llm/types';
import type { QueryPlan, CompiledQuery } from '../compiler/types';

// ── SQL Mode chart inference ─────────────────────────────────────
// Infers chart config from raw SQL result column names (snake_case)
// when no CompiledQuery is available (Mode B).

/** Column name substrings that indicate a date axis */
const DATE_COLUMN_PATTERNS = [
  'date', 'day', 'week', 'month', 'quarter', 'year', 'period',
];

/** Column name substrings that indicate a category axis */
const CATEGORY_COLUMN_PATTERNS = [
  'name', 'type', 'category', 'department', 'location', 'vendor',
  'customer', 'server', 'station', 'item', 'status', 'method',
  'channel', 'room_type', 'payment',
];

/** Column name substrings that indicate currency values */
const CURRENCY_COLUMN_PATTERNS = [
  'sales', 'revenue', 'cost', 'profit', 'spend', 'total', 'amount',
  'price', 'adr', 'revpar', 'avg_order', 'discount', 'tip', 'tax',
  'subtotal', 'balance', 'fee',
];

/** Column name substrings that indicate percentage values */
const PERCENT_COLUMN_PATTERNS = [
  'pct', 'percent', 'rate', 'margin', 'ratio', 'occupancy',
  'utilization', 'sell_through',
];

function isDateColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return DATE_COLUMN_PATTERNS.some((p) => lower.includes(p));
}

function isCategoryColumn(col: string): boolean {
  const lower = col.toLowerCase();
  // Exclude columns that are also date-like (e.g. "created_date")
  if (isDateColumn(col)) return false;
  // Exclude numeric-looking columns (e.g. "total_count")
  if (CURRENCY_COLUMN_PATTERNS.some((p) => lower.includes(p))) return false;
  if (PERCENT_COLUMN_PATTERNS.some((p) => lower.includes(p))) return false;
  // "id" columns are not categories
  if (lower === 'id' || lower.endsWith('_id')) return false;
  return CATEGORY_COLUMN_PATTERNS.some((p) => lower.includes(p));
}

function isNumericColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return (
    lower === 'count' || lower === 'total' || lower.startsWith('total_') ||
    lower.startsWith('avg_') || lower.startsWith('sum_') ||
    lower.endsWith('_count') || lower.endsWith('_total') ||
    lower.endsWith('_sum') || lower.endsWith('_avg') ||
    CURRENCY_COLUMN_PATTERNS.some((p) => lower.includes(p)) ||
    PERCENT_COLUMN_PATTERNS.some((p) => lower.includes(p))
  );
}

function inferYFormatFromColumns(columns: string[]): ChartConfig['yFormat'] {
  const lower = columns.map((c) => c.toLowerCase());
  if (lower.some((c) => PERCENT_COLUMN_PATTERNS.some((p) => c.includes(p)))) return 'percent';
  if (lower.some((c) => CURRENCY_COLUMN_PATTERNS.some((p) => c.includes(p)))) return 'currency';
  return 'number';
}

/**
 * Infer chart configuration from SQL query result columns.
 * Used in Mode B (SQL) where no CompiledQuery/QueryPlan metadata is available.
 *
 * Analyzes column names (snake_case from DB) to determine:
 * - Which column is the x-axis (date or category)
 * - Which columns are y-axis values (numeric)
 * - What chart type fits best
 */
export function inferChartConfigFromSqlResult(
  result: QueryResult | null,
  _sqlExplanation?: string,
): ChartConfig | null {
  if (!result || result.rowCount === 0) return null;

  const firstRow = result.rows[0];
  if (!firstRow) return null;

  const columns = Object.keys(firstRow);
  if (columns.length === 0) return null;

  const dateColumns = columns.filter(isDateColumn);
  const categoryColumns = columns.filter(isCategoryColumn);
  const numericColumns = columns.filter(isNumericColumn);

  // If no numeric columns detected, try to infer from actual values
  const valueColumns = numericColumns.length > 0
    ? numericColumns
    : columns.filter((col) => {
        if (isDateColumn(col) || isCategoryColumn(col)) return false;
        if (col === 'id' || col.endsWith('_id')) return false;
        const val = firstRow[col];
        return typeof val === 'number' || (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val));
      });

  if (valueColumns.length === 0) return null;

  const yFormat = inferYFormatFromColumns(valueColumns);
  const xDate = dateColumns[0];
  const xCategory = categoryColumns[0];

  // Rule 1: Single aggregate row (e.g. SELECT count(*) as total) → metric_card
  if (result.rowCount === 1 && !xDate && !xCategory) {
    return {
      type: 'metric_card',
      yAxis: valueColumns,
      title: valueColumns[0]!.replace(/_/g, ' '),
      yFormat,
    };
  }

  // Rule 2: Very small result (1-3 rows) with no date → metric_card
  if (result.rowCount <= 3 && !xDate) {
    return {
      type: 'metric_card',
      xAxis: xCategory ?? columns.find((c) => !valueColumns.includes(c)),
      yAxis: valueColumns,
      title: valueColumns[0]!.replace(/_/g, ' '),
      yFormat,
    };
  }

  // Rule 3: Has date column → line chart
  if (xDate) {
    if (result.rowCount > 30) {
      return { type: 'table', xAxis: xDate, yAxis: valueColumns, yFormat };
    }
    return {
      type: 'line',
      xAxis: xDate,
      yAxis: valueColumns,
      xLabel: xDate.replace(/_/g, ' '),
      yLabel: valueColumns[0]!.replace(/_/g, ' '),
      yFormat,
    };
  }

  // Rule 4: Has category column → bar or table
  if (xCategory) {
    if (result.rowCount > 20) {
      return { type: 'table', xAxis: xCategory, yAxis: valueColumns, yFormat };
    }
    return {
      type: 'bar',
      xAxis: xCategory,
      yAxis: valueColumns,
      xLabel: xCategory.replace(/_/g, ' '),
      yLabel: valueColumns[0]!.replace(/_/g, ' '),
      yFormat,
    };
  }

  // Rule 5: Many rows with no clear axis → table
  if (result.rowCount > 10) {
    return { type: 'table', yAxis: valueColumns, yFormat };
  }

  // Rule 6: Small result with at least one non-value column → bar
  const possibleX = columns.find((c) => !valueColumns.includes(c) && c !== 'id' && !c.endsWith('_id'));
  if (possibleX && result.rowCount > 1) {
    return {
      type: 'bar',
      xAxis: possibleX,
      yAxis: valueColumns,
      xLabel: possibleX.replace(/_/g, ' '),
      yLabel: valueColumns[0]!.replace(/_/g, ' '),
      yFormat,
    };
  }

  return null;
}

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
