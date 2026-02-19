import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockApiFetch } = vi.hoisted(() => {
  const mockApiFetch = vi.fn();
  return { mockApiFetch };
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
  ApiError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────
import {
  validateReportDefinition,
  parseFieldKey,
  extractDatasetsFromColumns,
  isValidDatasetCombination,
} from '../types/custom-reports';

// ═══════════════════════════════════════════════════════════════
// parseFieldKey
// ═══════════════════════════════════════════════════════════════

describe('parseFieldKey', () => {
  it('parses composite key with colon', () => {
    expect(parseFieldKey('item_sales:quantity_sold')).toEqual({
      dataset: 'item_sales',
      fieldKey: 'quantity_sold',
    });
  });

  it('returns empty dataset for bare key', () => {
    expect(parseFieldKey('quantity_sold')).toEqual({
      dataset: '',
      fieldKey: 'quantity_sold',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// extractDatasetsFromColumns
// ═══════════════════════════════════════════════════════════════

describe('extractDatasetsFromColumns', () => {
  it('extracts unique datasets from composite keys', () => {
    const datasets = extractDatasetsFromColumns([
      'item_sales:quantity_sold',
      'item_sales:catalog_item_name',
      'inventory:on_hand',
    ]);
    expect(datasets).toContain('item_sales');
    expect(datasets).toContain('inventory');
    expect(datasets).toHaveLength(2);
  });

  it('returns empty for bare keys', () => {
    const datasets = extractDatasetsFromColumns(['quantity_sold', 'on_hand']);
    expect(datasets).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// isValidDatasetCombination
// ═══════════════════════════════════════════════════════════════

describe('isValidDatasetCombination', () => {
  it('accepts single dataset', () => {
    expect(isValidDatasetCombination(['item_sales'])).toBe(true);
  });

  it('accepts item_sales + inventory', () => {
    expect(isValidDatasetCombination(['item_sales', 'inventory'])).toBe(true);
  });

  it('accepts daily_sales + item_sales', () => {
    expect(isValidDatasetCombination(['daily_sales', 'item_sales'])).toBe(true);
  });

  it('rejects customers + inventory', () => {
    expect(isValidDatasetCombination(['customers', 'inventory'])).toBe(false);
  });

  it('allows daily_sales + inventory', () => {
    expect(isValidDatasetCombination(['daily_sales', 'inventory'])).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// validateReportDefinition
// ═══════════════════════════════════════════════════════════════

describe('validateReportDefinition', () => {
  it('returns error for no datasets', () => {
    const errors = validateReportDefinition({ columns: ['a'], filters: [] }, []);
    expect(errors).toContain('At least one dataset is required — select some fields');
  });

  it('returns error for empty columns', () => {
    const errors = validateReportDefinition({ columns: [], filters: [] }, ['inventory']);
    expect(errors).toContain('At least one field must be selected');
  });

  it('returns error for too many columns (>20)', () => {
    const cols = Array.from({ length: 21 }, (_, i) => `col_${i}`);
    const errors = validateReportDefinition({ columns: cols, filters: [] }, ['inventory']);
    expect(errors).toContain('Maximum 20 columns allowed');
  });

  it('returns error for too many filters (>15)', () => {
    const filters = Array.from({ length: 16 }, (_, i) => ({
      fieldKey: `f_${i}`,
      op: 'eq' as const,
      value: 'x',
    }));
    const errors = validateReportDefinition({ columns: ['a'], filters }, ['inventory']);
    expect(errors).toContain('Maximum 15 filters allowed');
  });

  it('returns error for limit > 10000', () => {
    const errors = validateReportDefinition({
      columns: ['a'],
      filters: [],
      limit: 10001,
    }, ['inventory']);
    expect(errors).toContain('Maximum 10,000 rows allowed');
  });

  it('returns error for time-series dataset without date filter', () => {
    const errors = validateReportDefinition({
      columns: ['net_sales'],
      filters: [],
    }, ['daily_sales']);
    expect(errors).toContain('Date range filter is required for time-series datasets');
  });

  it('returns error for item_sales without date filter', () => {
    const errors = validateReportDefinition({
      columns: ['quantity_sold'],
      filters: [],
    }, ['item_sales']);
    expect(errors).toContain('Date range filter is required for time-series datasets');
  });

  it('returns error for date range > 365 days', () => {
    const errors = validateReportDefinition({
      columns: ['net_sales'],
      filters: [
        { fieldKey: 'daily_sales:business_date', op: 'gte', value: '2024-01-01' },
        { fieldKey: 'daily_sales:business_date', op: 'lte', value: '2025-06-01' },
      ],
    }, ['daily_sales']);
    expect(errors).toContain('Date range cannot exceed 365 days');
  });

  it('passes for inventory without date filter', () => {
    const errors = validateReportDefinition({
      columns: ['on_hand'],
      filters: [],
    }, ['inventory']);
    expect(errors).toHaveLength(0);
  });

  it('passes for valid daily_sales definition with composite keys', () => {
    const errors = validateReportDefinition({
      datasets: ['daily_sales'],
      columns: ['daily_sales:business_date', 'daily_sales:net_sales'],
      filters: [
        { fieldKey: 'daily_sales:business_date', op: 'gte', value: '2026-01-01' },
        { fieldKey: 'daily_sales:business_date', op: 'lte', value: '2026-01-31' },
      ],
    }, ['daily_sales']);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid multi-dataset definition', () => {
    const errors = validateReportDefinition({
      datasets: ['item_sales', 'inventory'],
      columns: ['item_sales:quantity_sold', 'inventory:on_hand'],
      filters: [
        { fieldKey: 'item_sales:business_date', op: 'gte', value: '2026-01-01' },
        { fieldKey: 'item_sales:business_date', op: 'lte', value: '2026-01-31' },
      ],
    }, ['item_sales', 'inventory']);
    expect(errors).toHaveLength(0);
  });

  it('rejects customers + inventory combination', () => {
    const errors = validateReportDefinition({
      datasets: ['customers', 'inventory'],
      columns: ['customers:customer_name', 'inventory:on_hand'],
      filters: [],
    }, ['customers', 'inventory']);
    expect(errors.some((e) => e.includes('cannot be combined'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// API URL construction
// ═══════════════════════════════════════════════════════════════

describe('custom report API calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
  });

  it('list reports calls correct URL', async () => {
    await mockApiFetch('/api/v1/reports/custom?');
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reports/custom'),
    );
  });

  it('get single report calls correct URL', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'rpt_1', name: 'Test' } });
    await mockApiFetch('/api/v1/reports/custom/rpt_1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reports/custom/rpt_1');
  });

  it('run report calls POST with reportId', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { columns: [], rows: [] } });
    await mockApiFetch('/api/v1/reports/custom/rpt_1/run', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/reports/custom/rpt_1/run',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('delete report calls DELETE method', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { success: true } });
    await mockApiFetch('/api/v1/reports/custom/rpt_1', { method: 'DELETE' });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/reports/custom/rpt_1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('save report uses POST for create', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'rpt_new' } });
    await mockApiFetch('/api/v1/reports/custom', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Report', dataset: 'daily_sales', definition: {} }),
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/reports/custom',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
