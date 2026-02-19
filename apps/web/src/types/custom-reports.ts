// Field catalog entry (from GET /api/v1/reports/fields)
export interface FieldCatalogEntry {
  id: string;
  dataset: string;
  fieldKey: string;
  label: string;
  dataType: 'number' | 'string' | 'date' | 'boolean';
  aggregation: string | null;
  isMetric: boolean;
  isFilterable: boolean;
  isSortable: boolean;
}

// Report filter
export interface ReportFilter {
  fieldKey: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
  value: string | number | boolean | string[];
}

// Report definition body (matches server-side ReportDefinitionBody)
export interface ReportDefinitionBody {
  datasets?: string[];    // present for multi-dataset reports
  columns: string[];      // composite keys: 'dataset:fieldKey'
  filters: ReportFilter[];
  sortBy?: { fieldKey: string; direction: 'asc' | 'desc' }[];
  groupBy?: string[];
  limit?: number;
}

// Saved report (from GET /api/v1/reports/custom)
export interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  dataset: string;
  definition: ReportDefinitionBody;
  createdBy: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// Run result (from POST /api/v1/reports/custom/:id/run)
export interface RunReportResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

// Dashboard tile
export interface DashboardTile {
  reportId: string;
  title: string;
  chartType: 'line' | 'bar' | 'table' | 'metric';
  position: { x: number; y: number };
  size: { w: number; h: number };
}

// Saved dashboard
export interface SavedDashboard {
  id: string;
  name: string;
  description: string | null;
  tiles: DashboardTile[];
  isDefault: boolean;
  createdBy: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// Dataset options for UI
export const DATASET_OPTIONS = [
  { value: 'daily_sales', label: 'Sales Daily' },
  { value: 'item_sales', label: 'Item Sales' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'customers', label: 'Customer Activity' },
] as const;

// Dataset display labels
export const DATASET_LABELS: Record<string, string> = {
  daily_sales: 'Sales Daily',
  item_sales: 'Item Sales',
  inventory: 'Inventory',
  customers: 'Customer Activity',
};

// Chart type options
export const CHART_TYPES = ['line', 'bar', 'table', 'metric'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

// Tile size presets
export const TILE_SIZE_PRESETS = {
  small: { w: 3, h: 2 },
  medium: { w: 6, h: 3 },
  large: { w: 12, h: 4 },
} as const;
export type TileSizePreset = keyof typeof TILE_SIZE_PRESETS;

// Time-series datasets that require date filters
export const TIME_SERIES_DATASETS = ['daily_sales', 'item_sales'] as const;

// Operator labels for UI
export const FILTER_OPERATORS = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  gte: 'greater or equal',
  lt: 'less than',
  lte: 'less or equal',
  in: 'in list',
  like: 'contains',
} as const;

// Operators by data type
export const OPERATORS_BY_TYPE: Record<string, ReportFilter['op'][]> = {
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'],
  string: ['eq', 'neq', 'like', 'in'],
  date: ['eq', 'gte', 'lte'],
  boolean: ['eq'],
};

// ── Cross-dataset support ─────────────────────────────────────

// Allowed JOIN pairs (sorted alphabetically when creating key)
export const JOINABLE_DATASET_PAIRS = new Set([
  'daily_sales+inventory',
  'daily_sales+item_sales',
  'inventory+item_sales',
]);

// Datasets that cannot be combined with others.
// rm_customer_activity is a lifetime aggregate per customer (no location_id or
// business_date column) so it cannot meaningfully join with the other read models.
export const STANDALONE_DATASETS = new Set(['customers']);

// Parse a composite field key like 'item_sales:quantity_sold'
export function parseFieldKey(key: string): { dataset: string; fieldKey: string } {
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) {
    return { dataset: '', fieldKey: key };
  }
  return { dataset: key.slice(0, colonIdx), fieldKey: key.slice(colonIdx + 1) };
}

// Extract unique datasets from an array of composite column keys
export function extractDatasetsFromColumns(columns: string[]): string[] {
  const datasets = new Set<string>();
  for (const col of columns) {
    const { dataset } = parseFieldKey(col);
    if (dataset) datasets.add(dataset);
  }
  return Array.from(datasets);
}

// Check if a combination of datasets is valid
export function isValidDatasetCombination(datasets: string[]): boolean {
  if (datasets.length <= 1) return true;

  // Standalone datasets cannot be combined
  if (datasets.some((d) => STANDALONE_DATASETS.has(d))) return false;

  // For 2 datasets, check the JOIN graph
  if (datasets.length === 2) {
    const sorted = [...datasets].sort();
    const key = `${sorted[0]}+${sorted[1]}`;
    return JOINABLE_DATASET_PAIRS.has(key);
  }

  // 3+ datasets: check that all pairs are joinable
  for (let i = 0; i < datasets.length; i++) {
    for (let j = i + 1; j < datasets.length; j++) {
      const sorted = [datasets[i]!, datasets[j]!].sort();
      const key = `${sorted[0]}+${sorted[1]}`;
      if (!JOINABLE_DATASET_PAIRS.has(key)) return false;
    }
  }
  return true;
}

// Client-side validation helper
export function validateReportDefinition(
  definition: ReportDefinitionBody,
  datasets?: string[],
): string[] {
  const errors: string[] = [];
  const effectiveDatasets = datasets ?? definition.datasets ?? [];

  if (effectiveDatasets.length === 0) {
    errors.push('At least one dataset is required — select some fields');
  }

  if (definition.columns.length === 0) {
    errors.push('At least one field must be selected');
  }

  if (definition.columns.length > 20) {
    errors.push('Maximum 20 columns allowed');
  }

  if (definition.filters.length > 15) {
    errors.push('Maximum 15 filters allowed');
  }

  if (definition.limit && definition.limit > 10000) {
    errors.push('Maximum 10,000 rows allowed');
  }

  // Validate dataset combination
  if (effectiveDatasets.length > 1 && !isValidDatasetCombination(effectiveDatasets)) {
    const labels = effectiveDatasets.map((d) => DATASET_LABELS[d] ?? d);
    errors.push(
      `${labels.join(' + ')} cannot be combined. Allowed pairs: Sales Daily + Item Sales, Item Sales + Inventory`,
    );
  }

  // Time-series datasets require date range
  const hasTimeSeries = effectiveDatasets.some((d) =>
    (TIME_SERIES_DATASETS as readonly string[]).includes(d),
  );
  if (hasTimeSeries) {
    // Look for business_date filters (may be composite or bare)
    const hasGte = definition.filters.some(
      (f) => {
        const { fieldKey } = parseFieldKey(f.fieldKey);
        return fieldKey === 'business_date' && f.op === 'gte';
      },
    );
    const hasLte = definition.filters.some(
      (f) => {
        const { fieldKey } = parseFieldKey(f.fieldKey);
        return fieldKey === 'business_date' && f.op === 'lte';
      },
    );
    if (!hasGte || !hasLte) {
      errors.push('Date range filter is required for time-series datasets');
    }

    // Check date range <= 365 days
    if (hasGte && hasLte) {
      const gteFilter = definition.filters.find((f) => {
        const { fieldKey } = parseFieldKey(f.fieldKey);
        return fieldKey === 'business_date' && f.op === 'gte';
      });
      const lteFilter = definition.filters.find((f) => {
        const { fieldKey } = parseFieldKey(f.fieldKey);
        return fieldKey === 'business_date' && f.op === 'lte';
      });
      if (gteFilter && lteFilter) {
        const from = new Date(String(gteFilter.value));
        const to = new Date(String(lteFilter.value));
        const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 365) {
          errors.push('Date range cannot exceed 365 days');
        }
      }
    }
  }

  return errors;
}
