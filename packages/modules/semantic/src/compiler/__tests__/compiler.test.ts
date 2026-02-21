import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock registry ─────────────────────────────────────────────────
// We inject controlled metric/dimension definitions so the compiler
// tests are independent of the real DB registry.

const { mockValidatePlan } = vi.hoisted(() => ({
  mockValidatePlan: vi.fn(),
}));

vi.mock('../../registry/registry', () => ({
  validatePlan: mockValidatePlan,
}));

vi.mock('@oppsera/db', () => ({ db: {} }));

import { compilePlan } from '../compiler';
import { CompilerError } from '../types';
import type { MetricDef, DimensionDef } from '../../registry/types';
import type { CompilerInput, QueryPlan } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────

function makeMetric(overrides: Partial<MetricDef> = {}): MetricDef {
  return {
    slug: 'net_sales',
    displayName: 'Net Sales',
    description: null,
    domain: 'core',
    category: 'revenue',
    tags: null,
    sqlExpression: 'SUM(net_sales)',
    sqlTable: 'rm_daily_sales',
    sqlAggregation: 'sum',
    sqlFilter: null,
    dataType: 'currency',
    formatPattern: '$0,0.00',
    unit: 'USD',
    higherIsBetter: true,
    aliases: null,
    examplePhrases: null,
    relatedMetrics: null,
    requiresDimensions: null,
    incompatibleWith: null,
    isActive: true,
    isExperimental: false,
    ...overrides,
  };
}

function makeDimension(overrides: Partial<DimensionDef> = {}): DimensionDef {
  return {
    slug: 'date',
    displayName: 'Date',
    description: null,
    domain: 'core',
    category: 'time',
    tags: null,
    sqlExpression: 'business_date',
    sqlTable: 'rm_daily_sales',
    sqlDataType: 'date',
    sqlCast: null,
    hierarchyParent: null,
    hierarchyLevel: 0,
    isTimeDimension: true,
    timeGranularities: ['day', 'week', 'month'],
    lookupTable: null,
    lookupKeyColumn: null,
    lookupLabelColumn: null,
    aliases: null,
    exampleValues: null,
    examplePhrases: null,
    isActive: true,
    ...overrides,
  };
}

const locationDim = makeDimension({
  slug: 'location',
  displayName: 'Location',
  sqlExpression: 'location_id',
  category: 'geography',
  isTimeDimension: false,
  timeGranularities: null,
});

function makeInput(planOverrides: Partial<QueryPlan> = {}, inputOverrides: Partial<CompilerInput> = {}): CompilerInput {
  return {
    plan: {
      metrics: ['net_sales'],
      dimensions: ['date'],
      filters: [],
      dateRange: { start: '2026-01-01', end: '2026-01-31' },
      ...planOverrides,
    },
    tenantId: 'tenant_abc',
    ...inputOverrides,
  };
}

function mockValidation(metrics: MetricDef[], dimensions: DimensionDef[]) {
  mockValidatePlan.mockResolvedValue({
    valid: true,
    errors: [],
    metrics,
    dimensions,
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe('compilePlan — basic output', () => {
  beforeEach(() => vi.clearAllMocks());

  it('produces valid SQL for a simple metric + date query', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput());

    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('SUM(net_sales) AS "net_sales"');
    expect(result.sql).toContain('business_date AS "date"');
    expect(result.sql).toContain('FROM rm_daily_sales');
    expect(result.sql).toContain('tenant_id =');
    expect(result.sql).toContain('GROUP BY business_date');
    expect(result.sql).toContain('LIMIT');
    expect(result.params).toContain('tenant_abc');
    expect(result.params).toContain('2026-01-01');
    expect(result.params).toContain('2026-01-31');
  });

  it('returns resolved metaDefs and dimensionDefs', async () => {
    const metric = makeMetric();
    const dim = makeDimension();
    mockValidation([metric], [dim]);

    const result = await compilePlan(makeInput());

    expect(result.metaDefs).toHaveLength(1);
    expect(result.metaDefs[0]!.slug).toBe('net_sales');
    expect(result.dimensionDefs).toHaveLength(1);
    expect(result.dimensionDefs[0]!.slug).toBe('date');
  });

  it('reports primaryTable correctly', async () => {
    mockValidation([makeMetric()], [makeDimension()]);
    const result = await compilePlan(makeInput());
    expect(result.primaryTable).toBe('rm_daily_sales');
  });

  it('includes no warnings on a clean plan', async () => {
    mockValidation([makeMetric()], [makeDimension()]);
    const result = await compilePlan(makeInput());
    expect(result.warnings).toHaveLength(0);
  });
});

describe('compilePlan — multiple metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates SELECT for each metric', async () => {
    const orderCount = makeMetric({
      slug: 'order_count',
      displayName: 'Order Count',
      sqlExpression: 'SUM(order_count)',
    });
    mockValidation([makeMetric(), orderCount], [makeDimension()]);

    const result = await compilePlan(makeInput({ metrics: ['net_sales', 'order_count'] }));

    expect(result.sql).toContain('SUM(net_sales) AS "net_sales"');
    expect(result.sql).toContain('SUM(order_count) AS "order_count"');
  });
});

describe('compilePlan — filters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds eq filter', async () => {
    mockValidation([makeMetric()], [makeDimension(), locationDim]);

    const result = await compilePlan(makeInput({
      dimensions: ['date', 'location'],
      filters: [{ dimensionSlug: 'location', operator: 'eq', value: 'loc_123' }],
    }));

    expect(result.sql).toContain('location_id =');
    expect(result.params).toContain('loc_123');
  });

  it('builds in filter', async () => {
    mockValidation([makeMetric()], [makeDimension(), locationDim]);

    const result = await compilePlan(makeInput({
      dimensions: ['date', 'location'],
      filters: [{ dimensionSlug: 'location', operator: 'in', values: ['loc_1', 'loc_2'] }],
    }));

    expect(result.sql).toContain('IN (');
    expect(result.params).toContain('loc_1');
    expect(result.params).toContain('loc_2');
  });

  it('builds gte/lte filters', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({
      filters: [
        { dimensionSlug: 'date', operator: 'gte', value: '2026-01-01' },
        { dimensionSlug: 'date', operator: 'lte', value: '2026-01-31' },
      ],
    }));

    expect(result.sql).toContain('>=');
    expect(result.sql).toContain('<=');
  });

  it('builds between filter', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({
      filters: [{ dimensionSlug: 'date', operator: 'between', rangeStart: '2026-01-01', rangeEnd: '2026-01-31' }],
    }));

    expect(result.sql).toContain('BETWEEN');
    expect(result.params).toContain('2026-01-01');
    expect(result.params).toContain('2026-01-31');
  });

  it('builds like filter', async () => {
    mockValidation([makeMetric()], [makeDimension(), locationDim]);

    const result = await compilePlan(makeInput({
      dimensions: ['date', 'location'],
      filters: [{ dimensionSlug: 'location', operator: 'like', value: 'Main' }],
    }));

    expect(result.sql).toContain('ILIKE');
    expect(result.params.some((p) => String(p).includes('Main'))).toBe(true);
  });

  it('warns but skips filter for unselected dimension', async () => {
    mockValidation([makeMetric()], [makeDimension()]); // only date selected, no location

    const result = await compilePlan(makeInput({
      dimensions: ['date'],
      filters: [{ dimensionSlug: 'location', operator: 'eq', value: 'loc_123' }],
    }));

    expect(result.warnings.some((w) => w.includes('location'))).toBe(true);
    expect(result.sql).not.toContain('loc_123');
  });

  it('throws on in filter with empty values array', async () => {
    mockValidation([makeMetric()], [makeDimension(), locationDim]);

    await expect(compilePlan(makeInput({
      dimensions: ['date', 'location'],
      filters: [{ dimensionSlug: 'location', operator: 'in', values: [] }],
    }))).rejects.toThrow(CompilerError);
  });
});

describe('compilePlan — tenant isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always includes tenant_id in WHERE', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({}, { tenantId: 'tenant_xyz' }));

    expect(result.sql).toContain('tenant_id =');
    expect(result.params).toContain('tenant_xyz');
  });

  it('includes location_id when locationId is provided', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({}, { tenantId: 'tenant_xyz', locationId: 'loc_001' }));

    expect(result.sql).toContain('location_id =');
    expect(result.params).toContain('loc_001');
  });
});

describe('compilePlan — date range guardrails', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws CompilerError when date range exceeds max', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    await expect(compilePlan(makeInput({
      dateRange: { start: '2024-01-01', end: '2026-01-01' }, // ~730 days
    }, { maxDateRangeDays: 365 }))).rejects.toThrow(CompilerError);
  });

  it('throws on invalid date strings', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    await expect(compilePlan(makeInput({
      dateRange: { start: 'not-a-date', end: '2026-01-31' },
    }))).rejects.toThrow(CompilerError);
  });

  it('throws when end is before start', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    await expect(compilePlan(makeInput({
      dateRange: { start: '2026-01-31', end: '2026-01-01' },
    }))).rejects.toThrow(CompilerError);
  });

  it('warns (does not throw) when no date range and metric is time-series', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({ dateRange: undefined }));

    expect(result.warnings.some((w) => w.includes('date range'))).toBe(true);
  });
});

describe('compilePlan — time granularity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('wraps date column in DATE_TRUNC for month granularity', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({ timeGranularity: 'month' }));

    expect(result.sql).toContain("DATE_TRUNC('month', business_date)");
  });

  it('wraps date column in DATE_TRUNC for week granularity', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({ timeGranularity: 'week' }));

    expect(result.sql).toContain("DATE_TRUNC('week', business_date)");
  });

  it('does not wrap for day granularity (identity)', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({ timeGranularity: 'day' }));

    expect(result.sql).not.toContain('DATE_TRUNC');
  });
});

describe('compilePlan — sorting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to date ASC for time-series queries', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput());

    expect(result.sql).toContain('ORDER BY "date" ASC');
  });

  it('defaults to first metric DESC for non-time queries', async () => {
    mockValidation([makeMetric()], [locationDim]);

    const result = await compilePlan(makeInput({ dimensions: ['location'] }));

    expect(result.sql).toContain('ORDER BY "net_sales" DESC');
  });

  it('respects explicit sort override', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({
      sort: [{ metricSlug: 'net_sales', direction: 'desc' }],
    }));

    expect(result.sql).toContain('ORDER BY "net_sales" DESC');
  });
});

describe('compilePlan — LIMIT', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses default limit when none specified', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput());

    // Default is 10,000 — it should appear as a param
    expect(result.params).toContain(10_000);
  });

  it('respects plan.limit', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({ limit: 100 }));

    expect(result.params).toContain(100);
  });

  it('clamps limit to ABSOLUTE_MAX_ROWS (50,000)', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    const result = await compilePlan(makeInput({ limit: 999_999 }));

    expect(result.params).toContain(50_000);
  });
});

describe('compilePlan — error cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NO_METRICS when metrics array is empty', async () => {
    await expect(compilePlan(makeInput({ metrics: [] }))).rejects.toThrow(CompilerError);

    let error: CompilerError | undefined;
    try { await compilePlan(makeInput({ metrics: [] })); } catch (e) { error = e as CompilerError; }
    expect(error?.code).toBe('NO_METRICS');
  });

  it('throws PLAN_VALIDATION_ERROR when registry validation fails', async () => {
    mockValidatePlan.mockResolvedValue({
      valid: false,
      errors: ['Unknown metric: bad_slug'],
      metrics: [],
      dimensions: [],
    });

    let error: CompilerError | undefined;
    try { await compilePlan(makeInput({ metrics: ['bad_slug'] })); } catch (e) { error = e as CompilerError; }
    expect(error?.code).toBe('PLAN_VALIDATION_ERROR');
    expect(error?.message).toContain('bad_slug');
  });

  it('throws DATE_RANGE_TOO_LARGE with correct code', async () => {
    mockValidation([makeMetric()], [makeDimension()]);

    let error: CompilerError | undefined;
    try {
      await compilePlan(makeInput({
        dateRange: { start: '2020-01-01', end: '2026-01-01' },
      }, { maxDateRangeDays: 90 }));
    } catch (e) {
      error = e as CompilerError;
    }
    expect(error?.code).toBe('DATE_RANGE_TOO_LARGE');
  });
});

describe('compilePlan — cross-table warning', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns when dimension comes from a different table', async () => {
    const crossTableDim = makeDimension({
      slug: 'item',
      displayName: 'Item',
      sqlTable: 'rm_item_sales', // different from rm_daily_sales
      isTimeDimension: false,
      timeGranularities: null,
    });
    mockValidation([makeMetric()], [crossTableDim]);

    const result = await compilePlan(makeInput({ dimensions: ['item'] }));

    expect(result.warnings.some((w) => w.includes('Cross-table'))).toBe(true);
    expect(result.joinTables).toContain('rm_item_sales');
  });
});

describe('compilePlan — metric sqlFilter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inlines metric sqlFilter into WHERE clause', async () => {
    const filteredMetric = makeMetric({
      slug: 'member_rounds',
      sqlFilter: "player_type = 'member'",
    });
    mockValidation([filteredMetric], [makeDimension()]);

    const result = await compilePlan(makeInput({ metrics: ['member_rounds'] }));

    expect(result.sql).toContain("player_type = 'member'");
  });
});
