import type { MetricDef, DimensionDef } from '../registry/types';

// ── LLM Plan shape ────────────────────────────────────────────────
// This is what the LLM returns as its structured intent.

export type FilterOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'gte' | 'lte' | 'between' | 'like' | 'is_null' | 'is_not_null';
export type SortDirection = 'asc' | 'desc';
export type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface PlanFilter {
  dimensionSlug: string;
  operator: FilterOperator;
  value?: unknown;           // single value for eq/neq/gte/lte/like
  values?: unknown[];        // array for in/not_in
  rangeStart?: unknown;      // for between
  rangeEnd?: unknown;        // for between
}

export interface PlanSort {
  metricSlug?: string;
  dimensionSlug?: string;
  direction: SortDirection;
}

export interface QueryPlan {
  metrics: string[];           // metric slugs to fetch
  dimensions: string[];        // dimension slugs to group by
  filters: PlanFilter[];
  dateRange?: {
    start: string;             // ISO date string
    end: string;
  };
  timeGranularity?: TimeGranularity;
  sort?: PlanSort[];
  limit?: number;
  lensSlug?: string;           // active lens context
  // Natural language fields preserved for context
  intent?: string;
  rationale?: string;
}

// ── Compiler input ────────────────────────────────────────────────

export interface CompilerInput {
  plan: QueryPlan;
  tenantId: string;
  locationId?: string;         // optional location filter
  maxRows?: number;            // override default 10,000 limit
  maxDateRangeDays?: number;   // override default 365 limit
  skipDateRangeCheck?: boolean; // for metrics that don't need date
}

// ── Compiled SQL output ───────────────────────────────────────────

export interface CompiledQuery {
  sql: string;
  params: unknown[];           // positional params ($1, $2, ...)
  metaDefs: MetricDef[];       // resolved metric definitions
  dimensionDefs: DimensionDef[]; // resolved dimension definitions
  warnings: string[];          // non-fatal issues
  // For debugging
  primaryTable: string;
  joinTables: string[];
}

// ── Compiler errors ───────────────────────────────────────────────

export class CompilerError extends Error {
  constructor(
    message: string,
    public code:
      | 'UNKNOWN_METRIC'
      | 'UNKNOWN_DIMENSION'
      | 'INCOMPATIBLE_METRICS'
      | 'MISSING_REQUIRED_DIMENSION'
      | 'DATE_RANGE_REQUIRED'
      | 'DATE_RANGE_TOO_LARGE'
      | 'NO_METRICS'
      | 'CROSS_TABLE_JOIN_UNSUPPORTED'
      | 'INVALID_FILTER'
      | 'PLAN_VALIDATION_ERROR',
  ) {
    super(message);
    this.name = 'CompilerError';
  }
}

// ── Guardrail constants ───────────────────────────────────────────

export const DEFAULT_MAX_ROWS = 10_000;
export const DEFAULT_MAX_DATE_RANGE_DAYS = 365;
export const ABSOLUTE_MAX_ROWS = 50_000;
