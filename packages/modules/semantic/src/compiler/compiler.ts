import { validatePlan } from '../registry/registry';
import type { MetricDef, DimensionDef } from '../registry/types';
import type {
  CompilerInput,
  CompiledQuery,
  PlanFilter,
  TimeGranularity,
} from './types';
import {
  CompilerError,
  DEFAULT_MAX_ROWS,
  DEFAULT_MAX_DATE_RANGE_DAYS,
  ABSOLUTE_MAX_ROWS,
} from './types';

// ── Parameter builder ─────────────────────────────────────────────
// Postgres positional params ($1, $2, ...). We accumulate values as we go.

class ParamBuilder {
  private params: unknown[] = [];

  add(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  all(): unknown[] {
    return this.params;
  }
}

// ── Date range helpers ────────────────────────────────────────────

function validateDateRange(
  start: string,
  end: string,
  maxDays: number,
): void {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new CompilerError('Invalid date range: dates must be ISO format', 'DATE_RANGE_REQUIRED');
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    throw new CompilerError('Date range end must be after start', 'DATE_RANGE_REQUIRED');
  }

  if (diffDays > maxDays) {
    throw new CompilerError(
      `Date range ${Math.round(diffDays)} days exceeds maximum of ${maxDays} days`,
      'DATE_RANGE_TOO_LARGE',
    );
  }
}

// ── Time granularity SQL ──────────────────────────────────────────

function applyTimeGranularity(sqlExpr: string, granularity: TimeGranularity): string {
  switch (granularity) {
    case 'day':
      return sqlExpr; // already day-level in rm_daily_sales
    case 'week':
      return `DATE_TRUNC('week', ${sqlExpr})`;
    case 'month':
      return `DATE_TRUNC('month', ${sqlExpr})`;
    case 'quarter':
      return `DATE_TRUNC('quarter', ${sqlExpr})`;
    case 'year':
      return `DATE_TRUNC('year', ${sqlExpr})`;
    default:
      return sqlExpr;
  }
}

// ── Filter → SQL ─────────────────────────────────────────────────

function buildFilterClause(
  filter: PlanFilter,
  dim: DimensionDef,
  params: ParamBuilder,
): string {
  const col = dim.sqlCast
    ? `CAST(${dim.sqlExpression} AS ${dim.sqlCast})`
    : dim.sqlExpression;

  switch (filter.operator) {
    case 'eq':
      return `${col} = ${params.add(filter.value)}`;

    case 'neq':
      return `${col} != ${params.add(filter.value)}`;

    case 'in': {
      if (!Array.isArray(filter.values) || filter.values.length === 0) {
        throw new CompilerError(
          `Filter "in" on "${filter.dimensionSlug}" requires non-empty values array`,
          'INVALID_FILTER',
        );
      }
      const placeholders = filter.values.map((v) => params.add(v)).join(', ');
      return `${col} IN (${placeholders})`;
    }

    case 'not_in': {
      if (!Array.isArray(filter.values) || filter.values.length === 0) {
        throw new CompilerError(
          `Filter "not_in" on "${filter.dimensionSlug}" requires non-empty values array`,
          'INVALID_FILTER',
        );
      }
      const placeholders = filter.values.map((v) => params.add(v)).join(', ');
      return `${col} NOT IN (${placeholders})`;
    }

    case 'gte':
      return `${col} >= ${params.add(filter.value)}`;

    case 'lte':
      return `${col} <= ${params.add(filter.value)}`;

    case 'between':
      if (filter.rangeStart === undefined || filter.rangeEnd === undefined) {
        throw new CompilerError(
          `Filter "between" on "${filter.dimensionSlug}" requires rangeStart and rangeEnd`,
          'INVALID_FILTER',
        );
      }
      return `${col} BETWEEN ${params.add(filter.rangeStart)} AND ${params.add(filter.rangeEnd)}`;

    case 'like':
      return `${col} ILIKE ${params.add(`%${filter.value}%`)}`;

    case 'is_null':
      return `${col} IS NULL`;

    case 'is_not_null':
      return `${col} IS NOT NULL`;

    default:
      throw new CompilerError(
        `Unknown filter operator: ${filter.operator as string}`,
        'INVALID_FILTER',
      );
  }
}

// ── Table resolution ───────────────────────────────────────────────
// Given a set of metrics + dimensions, resolve which primary table to SELECT FROM.
// Simple rule: all metric sqlTables must agree on a primary table.
// If they span different tables, we emit a join or raise an error.

function resolvePrimaryTable(metrics: MetricDef[]): string {
  const tables = new Set(metrics.map((m) => m.sqlTable));
  if (tables.size === 1) return tables.values().next().value!;

  // Multiple tables — choose the first metric's table as primary.
  // The compiler will emit warnings about potential multi-table issues.
  return metrics[0]!.sqlTable;
}

// ── Main compiler ─────────────────────────────────────────────────

export async function compilePlan(input: CompilerInput): Promise<CompiledQuery> {
  const {
    plan,
    tenantId,
    locationId,
    maxRows = DEFAULT_MAX_ROWS,
    maxDateRangeDays = DEFAULT_MAX_DATE_RANGE_DAYS,
    skipDateRangeCheck = false,
  } = input;

  const warnings: string[] = [];

  // ── 1. Guard: must have at least one metric ────────────────────
  if (!plan.metrics || plan.metrics.length === 0) {
    throw new CompilerError('Plan must specify at least one metric', 'NO_METRICS');
  }

  // ── 2. Clamp row limit ─────────────────────────────────────────
  const limit = Math.min(plan.limit ?? maxRows, ABSOLUTE_MAX_ROWS);

  // ── 3. Validate date range ─────────────────────────────────────
  if (plan.dateRange) {
    validateDateRange(plan.dateRange.start, plan.dateRange.end, maxDateRangeDays);
  }

  // ── 4. Validate plan via registry ─────────────────────────────
  const validation = await validatePlan(
    plan.metrics,
    plan.dimensions ?? [],
    {
      lensSlug: plan.lensSlug,
      skipDimensionCheck: skipDateRangeCheck,
    },
  );

  if (!validation.valid) {
    throw new CompilerError(
      `Plan validation failed: ${validation.errors.join('; ')}`,
      'PLAN_VALIDATION_ERROR',
    );
  }

  const { metrics: metaDefs, dimensions: dimensionDefs } = validation;

  // ── 5. Check date range requirement ───────────────────────────
  if (!skipDateRangeCheck && !plan.dateRange) {
    // Check if any metric requires a date range (time-series metrics)
    const requiresDate = metaDefs.some(
      (m) => m.requiresDimensions?.includes('date') || m.sqlTable.startsWith('rm_'),
    );
    // If dimensions include a time dimension, date range is strongly recommended
    const hasTimeDim = dimensionDefs.some((d) => d.isTimeDimension);

    if (requiresDate || hasTimeDim) {
      warnings.push(
        'No date range specified for a time-series metric. Results may be large or slow.',
      );
    }
  }

  // ── 6. Resolve tables ─────────────────────────────────────────
  const primaryTable = resolvePrimaryTable(metaDefs);
  const joinTables: string[] = [];

  // Check if dimensions come from a different table
  for (const dim of dimensionDefs) {
    if (dim.sqlTable !== primaryTable && !joinTables.includes(dim.sqlTable)) {
      joinTables.push(dim.sqlTable);
    }
  }

  if (joinTables.length > 0) {
    warnings.push(
      `Cross-table dimensions detected (${joinTables.join(', ')}). Join logic not auto-generated — verify SQL.`,
    );
  }

  // ── 7. Build SQL ──────────────────────────────────────────────
  const params = new ParamBuilder();

  // SELECT clause
  const selectParts: string[] = [];

  // Dimension expressions (GROUP BY columns come first for readability)
  for (const dim of dimensionDefs) {
    let dimExpr = dim.sqlExpression;

    // Apply time granularity to time dimensions
    if (dim.isTimeDimension && plan.timeGranularity && plan.timeGranularity !== 'day') {
      dimExpr = applyTimeGranularity(dimExpr, plan.timeGranularity);
    }

    selectParts.push(`${dimExpr} AS "${dim.slug}"`);
  }

  // Metric expressions
  for (const metric of metaDefs) {
    selectParts.push(`${metric.sqlExpression} AS "${metric.slug}"`);
  }

  // WHERE conditions
  const whereParts: string[] = [];

  // Mandatory tenant isolation
  whereParts.push(`tenant_id = ${params.add(tenantId)}`);

  // Optional location filter
  if (locationId) {
    whereParts.push(`location_id = ${params.add(locationId)}`);
  }

  // Date range
  if (plan.dateRange) {
    // Find date dimension to figure out column name
    const dateDim = dimensionDefs.find((d) => d.isTimeDimension && d.slug === 'date');
    const dateCol = dateDim?.sqlExpression ?? 'business_date';
    whereParts.push(`${dateCol} >= ${params.add(plan.dateRange.start)}`);
    whereParts.push(`${dateCol} <= ${params.add(plan.dateRange.end)}`);
  }

  // Metric-level SQL filters
  for (const metric of metaDefs) {
    if (metric.sqlFilter) {
      whereParts.push(metric.sqlFilter); // pre-validated, no user input
    }
  }

  // Dimension filters from plan
  const dimMap = new Map(dimensionDefs.map((d) => [d.slug, d]));

  for (const filter of plan.filters ?? []) {
    const dim = dimMap.get(filter.dimensionSlug);
    if (!dim) {
      warnings.push(`Filter on unknown/unselected dimension "${filter.dimensionSlug}" — skipped`);
      continue;
    }
    whereParts.push(buildFilterClause(filter, dim, params));
  }

  // GROUP BY clause
  const groupByParts = dimensionDefs.map((dim) => {
    let expr = dim.sqlExpression;
    if (dim.isTimeDimension && plan.timeGranularity && plan.timeGranularity !== 'day') {
      expr = applyTimeGranularity(expr, plan.timeGranularity);
    }
    return expr;
  });

  // ORDER BY clause
  const orderByParts: string[] = [];
  if (plan.sort && plan.sort.length > 0) {
    for (const s of plan.sort) {
      if (s.metricSlug) {
        orderByParts.push(`"${s.metricSlug}" ${s.direction.toUpperCase()}`);
      } else if (s.dimensionSlug) {
        orderByParts.push(`"${s.dimensionSlug}" ${s.direction.toUpperCase()}`);
      }
    }
  } else if (dimensionDefs.some((d) => d.isTimeDimension)) {
    // Default: sort by date ascending for time-series
    const timeDim = dimensionDefs.find((d) => d.isTimeDimension);
    if (timeDim) {
      orderByParts.push(`"${timeDim.slug}" ASC`);
    }
  } else if (metaDefs.length > 0) {
    // Default: sort by first metric descending for ranking queries
    orderByParts.push(`"${metaDefs[0]!.slug}" DESC`);
  }

  // ── 8. Assemble final SQL ─────────────────────────────────────
  const sql = [
    `SELECT`,
    `  ${selectParts.join(',\n  ')}`,
    `FROM ${primaryTable}`,
    whereParts.length > 0 ? `WHERE ${whereParts.join('\n  AND ')}` : '',
    groupByParts.length > 0 ? `GROUP BY ${groupByParts.join(', ')}` : '',
    orderByParts.length > 0 ? `ORDER BY ${orderByParts.join(', ')}` : '',
    `LIMIT ${params.add(limit)}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    sql,
    params: params.all(),
    metaDefs,
    dimensionDefs,
    warnings,
    primaryTable,
    joinTables,
  };
}
