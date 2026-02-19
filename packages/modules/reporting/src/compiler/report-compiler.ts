import { ValidationError } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────

export interface ReportFilter {
  fieldKey: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
  value: string | number | boolean | string[];
}

export interface ReportDefinitionBody {
  datasets?: string[];
  columns: string[];
  filters: ReportFilter[];
  sortBy?: { fieldKey: string; direction: 'asc' | 'desc' }[];
  groupBy?: string[];
  limit?: number;
}

export interface DashboardTile {
  reportId: string;
  title: string;
  chartType: 'line' | 'bar' | 'table' | 'metric';
  position: { x: number; y: number };
  size: { w: number; h: number };
}

export interface FieldCatalogEntry {
  id: string;
  dataset: string;
  fieldKey: string;
  label: string;
  dataType: string;
  aggregation: string | null;
  isMetric: boolean;
  isFilturable: boolean;
  isSortable: boolean;
  columnExpression: string;
  tableRef: string;
}

export interface CompileReportInput {
  tenantId: string;
  dataset: string;
  definition: ReportDefinitionBody;
  fieldCatalog: FieldCatalogEntry[];
}

export interface CompiledQuery {
  sql: string;
  params: unknown[];
}

// ── Dataset → Table mapping ─────────────────────────────────────

const DATASET_TABLES: Record<string, string> = {
  daily_sales: 'rm_daily_sales',
  item_sales: 'rm_item_sales',
  inventory: 'rm_inventory_on_hand',
  customers: 'rm_customer_activity',
  golf_tee_time_fact: 'rm_golf_tee_time_fact',
  golf_utilization: 'rm_golf_tee_time_demand',
  golf_revenue: 'rm_golf_revenue_daily',
  golf_pace: 'rm_golf_pace_daily',
  golf_customer_play: 'rm_golf_customer_play',
  golf_ops: 'rm_golf_ops_daily',
  golf_channel: 'rm_golf_channel_daily',
};

const TABLE_ALIASES: Record<string, string> = {
  daily_sales: 'ds',
  item_sales: 'is_',
  inventory: 'inv',
  customers: 'ca',
  golf_tee_time_fact: 'gf',
  golf_utilization: 'gu',
  golf_revenue: 'grev',
  golf_pace: 'gp',
  golf_customer_play: 'gc',
  golf_ops: 'gop',
  golf_channel: 'gch',
};

const TIME_SERIES_DATASETS = new Set([
  'daily_sales', 'item_sales',
  'golf_tee_time_fact', 'golf_utilization', 'golf_revenue',
  'golf_pace', 'golf_ops', 'golf_channel',
]);

// ── JOIN Graph ──────────────────────────────────────────────────

interface JoinEdge {
  left: string;
  right: string;
  on: string[];  // condition strings using table aliases
}

const JOIN_GRAPH: Record<string, JoinEdge> = {
  'daily_sales+item_sales': {
    left: 'daily_sales',
    right: 'item_sales',
    on: [
      'ds.tenant_id = is_.tenant_id',
      'ds.location_id = is_.location_id',
      'ds.business_date = is_.business_date',
    ],
  },
  'daily_sales+inventory': {
    left: 'daily_sales',
    right: 'inventory',
    on: [
      'ds.tenant_id = inv.tenant_id',
      'ds.location_id = inv.location_id',
    ],
  },
  'inventory+item_sales': {
    left: 'item_sales',
    right: 'inventory',
    on: [
      'is_.tenant_id = inv.tenant_id',
      'is_.location_id = inv.location_id',
      'is_.catalog_item_id = inv.inventory_item_id',
    ],
  },
};

const JOINABLE_PAIRS = new Set(Object.keys(JOIN_GRAPH));

// ── Guardrails ──────────────────────────────────────────────────

const MAX_COLUMNS = 20;
const MAX_FILTERS = 15;
const MAX_LIMIT = 10_000;
const DEFAULT_LIMIT = 1_000;
const MAX_DATE_RANGE_DAYS = 365;

const VALID_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like']);

const OP_SQL: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'ILIKE',
};

// ── Helpers ─────────────────────────────────────────────────────

/** Resolve effective datasets from the report definition + fallback dataset */
export function resolveDatasets(dataset: string, definition: ReportDefinitionBody): string[] {
  return definition.datasets?.length ? definition.datasets : [dataset];
}

/** Parse composite field key 'dataset:fieldKey' → { dataset, fieldKey } */
function parseFieldKey(key: string, fallbackDataset: string): { dataset: string; fieldKey: string } {
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) {
    return { dataset: fallbackDataset, fieldKey: key };
  }
  return { dataset: key.slice(0, colonIdx), fieldKey: key.slice(colonIdx + 1) };
}

/** Resolve a field from the catalog using a composite key */
function resolveField(
  key: string,
  fallbackDataset: string,
  fieldMap: Map<string, FieldCatalogEntry>,
): FieldCatalogEntry | undefined {
  const { dataset, fieldKey } = parseFieldKey(key, fallbackDataset);
  return fieldMap.get(`${dataset}:${fieldKey}`);
}

// ── Compiler ────────────────────────────────────────────────────

export function compileReport(input: CompileReportInput): CompiledQuery {
  const { tenantId, dataset, definition, fieldCatalog } = input;
  const { columns, filters, sortBy, groupBy, limit } = definition;

  const datasets = resolveDatasets(dataset, definition);

  // Validate all datasets are known
  for (const ds of datasets) {
    if (!DATASET_TABLES[ds]) {
      throw new ValidationError(`Unknown dataset: ${ds}`);
    }
  }

  // Build field lookup map keyed by 'dataset:fieldKey'
  const fieldMap = new Map<string, FieldCatalogEntry>();
  for (const f of fieldCatalog) {
    if (datasets.includes(f.dataset)) {
      fieldMap.set(`${f.dataset}:${f.fieldKey}`, f);
    }
  }

  // Validate columns
  if (!columns || columns.length === 0) {
    throw new ValidationError('At least one column is required');
  }
  if (columns.length > MAX_COLUMNS) {
    throw new ValidationError(`Maximum ${MAX_COLUMNS} columns allowed`);
  }
  for (const col of columns) {
    const field = resolveField(col, dataset, fieldMap);
    if (!field) {
      throw new ValidationError(`Unknown field "${col}" for dataset(s) "${datasets.join(', ')}"`);
    }
  }

  // Validate filters
  if (filters && filters.length > MAX_FILTERS) {
    throw new ValidationError(`Maximum ${MAX_FILTERS} filters allowed`);
  }
  for (const f of filters ?? []) {
    if (!VALID_OPS.has(f.op)) {
      throw new ValidationError(`Unknown filter operator: ${f.op}`);
    }
    const field = resolveField(f.fieldKey, dataset, fieldMap);
    if (!field) {
      throw new ValidationError(`Unknown filter field "${f.fieldKey}" for dataset(s) "${datasets.join(', ')}"`);
    }
    if (!field.isFilturable) {
      throw new ValidationError(`Field "${f.fieldKey}" is not filterable`);
    }
  }

  // Validate groupBy
  if (groupBy) {
    for (const g of groupBy) {
      if (!resolveField(g, dataset, fieldMap)) {
        throw new ValidationError(`Unknown groupBy field "${g}" for dataset(s) "${datasets.join(', ')}"`);
      }
    }
  }

  // Validate sortBy
  if (sortBy) {
    for (const s of sortBy) {
      const field = resolveField(s.fieldKey, dataset, fieldMap);
      if (!field) {
        throw new ValidationError(`Unknown sortBy field "${s.fieldKey}" for dataset(s) "${datasets.join(', ')}"`);
      }
      if (!field.isSortable) {
        throw new ValidationError(`Field "${s.fieldKey}" is not sortable`);
      }
    }
  }

  // Enforce date range for time-series datasets
  const hasTimeSeries = datasets.some((d) => TIME_SERIES_DATASETS.has(d));
  if (hasTimeSeries) {
    const dateFilters = (filters ?? []).filter((f) => {
      const { fieldKey } = parseFieldKey(f.fieldKey, dataset);
      return fieldKey === 'business_date';
    });
    const hasGte = dateFilters.some((f) => f.op === 'gte');
    const hasLte = dateFilters.some((f) => f.op === 'lte');
    if (!hasGte || !hasLte) {
      throw new ValidationError(
        'Time-series datasets require business_date filters with both gte and lte operators',
      );
    }

    const gteFilter = dateFilters.find((f) => f.op === 'gte');
    const lteFilter = dateFilters.find((f) => f.op === 'lte');
    if (gteFilter && lteFilter) {
      const from = new Date(String(gteFilter.value));
      const to = new Date(String(lteFilter.value));
      const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > MAX_DATE_RANGE_DAYS) {
        throw new ValidationError(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
      }
    }
  }

  // Validate limit
  const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  if (limit !== undefined && limit > MAX_LIMIT) {
    throw new ValidationError(`Limit cannot exceed ${MAX_LIMIT}`);
  }

  // ── Route to single-table or multi-table path ─────────────────

  if (datasets.length === 1) {
    return compileSingleDataset(datasets[0]!, dataset, fieldMap, definition, tenantId, effectiveLimit);
  }
  return compileMultiDataset(datasets, dataset, fieldMap, definition, tenantId, effectiveLimit);
}

// ── Single-dataset compile (backward compat — no aliases) ────────

function compileSingleDataset(
  ds: string,
  fallbackDataset: string,
  fieldMap: Map<string, FieldCatalogEntry>,
  definition: ReportDefinitionBody,
  tenantId: string,
  effectiveLimit: number,
): CompiledQuery {
  const { columns, filters, sortBy, groupBy } = definition;
  const tableName = DATASET_TABLES[ds]!;

  const params: unknown[] = [];
  let paramIdx = 0;
  const nextParam = (value: unknown): string => {
    paramIdx++;
    params.push(value);
    return `$${paramIdx}`;
  };

  const hasGroupBy = groupBy && groupBy.length > 0;

  const selectExprs = columns.map((col) => {
    const field = resolveField(col, fallbackDataset, fieldMap)!;
    const outputAlias = `"${field.dataset}:${field.fieldKey}"`;
    if (hasGroupBy && field.isMetric && field.aggregation) {
      return `${field.aggregation}(${field.columnExpression}) AS ${outputAlias}`;
    }
    return `${field.columnExpression} AS ${outputAlias}`;
  });

  const tenantParam = nextParam(tenantId);
  const whereClauses = [`tenant_id = ${tenantParam}`];

  for (const f of filters ?? []) {
    const field = resolveField(f.fieldKey, fallbackDataset, fieldMap)!;
    if (f.op === 'in') {
      const values = Array.isArray(f.value) ? f.value : [f.value];
      const placeholders = values.map((v) => nextParam(v));
      whereClauses.push(`${field.columnExpression} IN (${placeholders.join(', ')})`);
    } else {
      const opSql = OP_SQL[f.op];
      const valParam = nextParam(f.value);
      whereClauses.push(`${field.columnExpression} ${opSql} ${valParam}`);
    }
  }

  let groupByClause = '';
  if (hasGroupBy) {
    const groupByCols = groupBy!.map((g) => resolveField(g, fallbackDataset, fieldMap)!.columnExpression);
    groupByClause = `GROUP BY ${groupByCols.join(', ')}`;
  }

  let orderByClause = '';
  if (sortBy && sortBy.length > 0) {
    const orderByCols = sortBy.map((s) => {
      const field = resolveField(s.fieldKey, fallbackDataset, fieldMap)!;
      const dir = s.direction === 'desc' ? 'DESC' : 'ASC';
      return `${field.columnExpression} ${dir}`;
    });
    orderByClause = `ORDER BY ${orderByCols.join(', ')}`;
  }

  const limitParam = nextParam(effectiveLimit);
  const limitClause = `LIMIT ${limitParam}`;

  const parts = [
    `SELECT ${selectExprs.join(', ')}`,
    `FROM ${tableName}`,
    `WHERE ${whereClauses.join(' AND ')}`,
  ];
  if (groupByClause) parts.push(groupByClause);
  if (orderByClause) parts.push(orderByClause);
  parts.push(limitClause);

  return { sql: parts.join('\n'), params };
}

// ── Multi-dataset compile (JOIN path) ────────────────────────────

function compileMultiDataset(
  datasets: string[],
  fallbackDataset: string,
  fieldMap: Map<string, FieldCatalogEntry>,
  definition: ReportDefinitionBody,
  tenantId: string,
  effectiveLimit: number,
): CompiledQuery {
  const { columns, filters, sortBy, groupBy } = definition;

  // Build a join chain: start with the first dataset, greedily attach
  // remaining datasets via pairwise edges from JOIN_GRAPH.
  const joinChain: string[] = [datasets[0]!];
  const remaining = new Set(datasets.slice(1));
  const chainEdges: { dataset: string; edge: JoinEdge }[] = [];

  while (remaining.size > 0) {
    let found = false;
    for (const candidate of remaining) {
      for (const inChain of joinChain) {
        const pairKey = [candidate, inChain].sort().join('+');
        const edge = JOIN_GRAPH[pairKey];
        if (edge) {
          joinChain.push(candidate);
          remaining.delete(candidate);
          chainEdges.push({ dataset: candidate, edge });
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      throw new ValidationError(
        `Datasets "${datasets.join(', ')}" cannot be joined. Allowed: ${Array.from(JOINABLE_PAIRS).join(', ')}`,
      );
    }
  }

  const primaryDs = joinChain[0]!;
  const primaryTable = DATASET_TABLES[primaryDs]!;
  const primaryAlias = TABLE_ALIASES[primaryDs]!;

  const params: unknown[] = [];
  let paramIdx = 0;
  const nextParam = (value: unknown): string => {
    paramIdx++;
    params.push(value);
    return `$${paramIdx}`;
  };

  const aliasFor = (ds: string): string => TABLE_ALIASES[ds]!;

  const hasGroupBy = groupBy && groupBy.length > 0;

  // SELECT clause — qualified with aliases and aliased as composite keys
  const selectExprs = columns.map((col) => {
    const field = resolveField(col, fallbackDataset, fieldMap)!;
    const alias = aliasFor(field.dataset);
    const qualifiedCol = `${alias}.${field.columnExpression}`;
    const outputAlias = `"${field.dataset}:${field.fieldKey}"`;
    if (hasGroupBy && field.isMetric && field.aggregation) {
      return `${field.aggregation}(${qualifiedCol}) AS ${outputAlias}`;
    }
    return `${qualifiedCol} AS ${outputAlias}`;
  });

  // WHERE — tenant_id anchored on the primary table
  const tenantParam = nextParam(tenantId);
  const whereClauses = [`${primaryAlias}.tenant_id = ${tenantParam}`];

  for (const f of filters ?? []) {
    const field = resolveField(f.fieldKey, fallbackDataset, fieldMap)!;
    const alias = aliasFor(field.dataset);
    const qualifiedCol = `${alias}.${field.columnExpression}`;
    if (f.op === 'in') {
      const values = Array.isArray(f.value) ? f.value : [f.value];
      const placeholders = values.map((v) => nextParam(v));
      whereClauses.push(`${qualifiedCol} IN (${placeholders.join(', ')})`);
    } else {
      const opSql = OP_SQL[f.op];
      const valParam = nextParam(f.value);
      whereClauses.push(`${qualifiedCol} ${opSql} ${valParam}`);
    }
  }

  // GROUP BY
  let groupByClause = '';
  if (hasGroupBy) {
    const groupByCols = groupBy!.map((g) => {
      const field = resolveField(g, fallbackDataset, fieldMap)!;
      return `${aliasFor(field.dataset)}.${field.columnExpression}`;
    });
    groupByClause = `GROUP BY ${groupByCols.join(', ')}`;
  }

  // ORDER BY
  let orderByClause = '';
  if (sortBy && sortBy.length > 0) {
    const orderByCols = sortBy.map((s) => {
      const field = resolveField(s.fieldKey, fallbackDataset, fieldMap)!;
      const dir = s.direction === 'desc' ? 'DESC' : 'ASC';
      return `${aliasFor(field.dataset)}.${field.columnExpression} ${dir}`;
    });
    orderByClause = `ORDER BY ${orderByCols.join(', ')}`;
  }

  // LIMIT
  const limitParam = nextParam(effectiveLimit);
  const limitClause = `LIMIT ${limitParam}`;

  // Build chained LEFT JOIN clauses
  const joinClauses = chainEdges.map(({ dataset, edge }) => {
    const table = DATASET_TABLES[dataset]!;
    const alias = TABLE_ALIASES[dataset]!;
    const onClause = edge.on.join(' AND ');
    return `LEFT JOIN ${table} ${alias} ON ${onClause}`;
  });

  const parts = [
    `SELECT ${selectExprs.join(', ')}`,
    `FROM ${primaryTable} ${primaryAlias}`,
    ...joinClauses,
    `WHERE ${whereClauses.join(' AND ')}`,
  ];
  if (groupByClause) parts.push(groupByClause);
  if (orderByClause) parts.push(orderByClause);
  parts.push(limitClause);

  return { sql: parts.join('\n'), params };
}
