import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @oppsera/db ─────────────────────────────────────────────
// We inject a fake cache via setRegistryCache to avoid DB calls.

vi.mock('@oppsera/db', () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  semanticMetrics: { isActive: 'is_active' },
  semanticDimensions: { isActive: 'is_active' },
  semanticMetricDimensions: {},
  semanticLenses: { isActive: 'is_active' },
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'TEST_ULID'),
}));

import {
  getMetric,
  getDimension,
  listMetrics,
  listDimensions,
  getLens,
  listLenses,
  getValidDimensionsForMetric,
  getDefaultDimensionsForMetric,
  validatePlan,
  buildRegistryCatalog,
  invalidateRegistryCache,
  setRegistryCache,
  UnknownMetricError,
  UnknownDimensionError,
} from '../registry';
import type { RegistryCache } from '../registry';
import type { MetricDef, DimensionDef, LensDef } from '../types';

// ── Test fixtures ─────────────────────────────────────────────────

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
    aliases: ['revenue', 'sales'],
    examplePhrases: null,
    relatedMetrics: ['order_count'],
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
    aliases: ['day', 'when'],
    exampleValues: null,
    examplePhrases: null,
    isActive: true,
    ...overrides,
  };
}

function makeLens(overrides: Partial<LensDef> = {}): LensDef {
  return {
    slug: 'core_sales',
    displayName: 'Sales & Revenue',
    description: null,
    domain: 'core',
    allowedMetrics: ['net_sales', 'order_count'],
    allowedDimensions: ['date', 'location'],
    defaultMetrics: ['net_sales'],
    defaultDimensions: ['date'],
    defaultFilters: null,
    systemPromptFragment: 'Focus on sales data.',
    exampleQuestions: ['How were sales yesterday?'],
    isActive: true,
    isSystem: true,
    ...overrides,
  };
}

function makeCache(overrides: Partial<RegistryCache> = {}): RegistryCache {
  const metrics = new Map<string, MetricDef>([
    ['net_sales', makeMetric()],
    ['order_count', makeMetric({ slug: 'order_count', displayName: 'Order Count', domain: 'core', category: 'volume', incompatibleWith: null })],
    ['items_sold', makeMetric({ slug: 'items_sold', displayName: 'Items Sold', domain: 'core', category: 'volume', incompatibleWith: ['avg_order_value'] })],
    ['avg_order_value', makeMetric({ slug: 'avg_order_value', displayName: 'AOV', domain: 'core', incompatibleWith: ['items_sold'] })],
    ['rounds_played', makeMetric({ slug: 'rounds_played', displayName: 'Rounds Played', domain: 'golf', category: 'volume', requiresDimensions: null })],
  ]);

  const dimensions = new Map<string, DimensionDef>([
    ['date', makeDimension()],
    ['location', makeDimension({ slug: 'location', displayName: 'Location', category: 'geography', isTimeDimension: false, timeGranularities: null })],
    ['golf_course', makeDimension({ slug: 'golf_course', displayName: 'Course', domain: 'golf', category: 'golf', isTimeDimension: false, timeGranularities: null })],
  ]);

  const relations = [
    { metricSlug: 'net_sales', dimensionSlug: 'date', isRequired: false, isDefault: true, sortOrder: 0 },
    { metricSlug: 'net_sales', dimensionSlug: 'location', isRequired: false, isDefault: false, sortOrder: 1 },
    { metricSlug: 'rounds_played', dimensionSlug: 'date', isRequired: false, isDefault: true, sortOrder: 0 },
    { metricSlug: 'rounds_played', dimensionSlug: 'golf_course', isRequired: false, isDefault: false, sortOrder: 1 },
    { metricSlug: 'order_count', dimensionSlug: 'date', isRequired: true, isDefault: true, sortOrder: 0 },
  ];

  const lenses = new Map<string, LensDef>([
    ['core_sales', makeLens()],
    ['golf_ops', makeLens({
      slug: 'golf_ops',
      displayName: 'Golf Operations',
      domain: 'golf',
      allowedMetrics: ['rounds_played'],
      allowedDimensions: ['date', 'golf_course'],
    })],
  ]);

  return { metrics, dimensions, relations, lenses, loadedAt: Date.now(), ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────

describe('getMetric', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns metric by slug', async () => {
    const m = await getMetric('net_sales');
    expect(m.slug).toBe('net_sales');
    expect(m.displayName).toBe('Net Sales');
  });

  it('throws UnknownMetricError for missing slug', async () => {
    await expect(getMetric('nonexistent_metric')).rejects.toThrow(UnknownMetricError);
    await expect(getMetric('nonexistent_metric')).rejects.toThrow('Unknown metric: nonexistent_metric');
  });
});

describe('getDimension', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns dimension by slug', async () => {
    const d = await getDimension('date');
    expect(d.slug).toBe('date');
    expect(d.isTimeDimension).toBe(true);
  });

  it('throws UnknownDimensionError for missing slug', async () => {
    await expect(getDimension('nonexistent')).rejects.toThrow(UnknownDimensionError);
  });
});

describe('listMetrics', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns all metrics when no domain filter', async () => {
    const all = await listMetrics();
    expect(all.length).toBeGreaterThan(0);
  });

  it('filters by domain', async () => {
    const core = await listMetrics('core');
    expect(core.every((m) => m.domain === 'core')).toBe(true);

    const golf = await listMetrics('golf');
    expect(golf.every((m) => m.domain === 'golf')).toBe(true);
  });
});

describe('listDimensions', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns all dimensions when no domain filter', async () => {
    const all = await listDimensions();
    expect(all.length).toBeGreaterThan(0);
  });

  it('filters by domain', async () => {
    const core = await listDimensions('core');
    expect(core.every((d) => d.domain === 'core')).toBe(true);
  });
});

describe('getLens / listLenses', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns lens by slug', async () => {
    const lens = await getLens('core_sales');
    expect(lens).not.toBeNull();
    expect(lens?.displayName).toBe('Sales & Revenue');
  });

  it('returns null for unknown lens', async () => {
    const lens = await getLens('nonexistent');
    expect(lens).toBeNull();
  });

  it('listLenses filters by domain', async () => {
    const golf = await listLenses('golf');
    expect(golf.every((l) => l.domain === 'golf')).toBe(true);
  });
});

describe('getValidDimensionsForMetric', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns valid dimensions for a metric', async () => {
    const dims = await getValidDimensionsForMetric('net_sales');
    const slugs = dims.map((d) => d.slug);
    expect(slugs).toContain('date');
    expect(slugs).toContain('location');
  });

  it('returns empty array for metric with no relations', async () => {
    const dims = await getValidDimensionsForMetric('items_sold');
    expect(dims).toEqual([]);
  });
});

describe('getDefaultDimensionsForMetric', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns only default dimensions, in sortOrder', async () => {
    const dims = await getDefaultDimensionsForMetric('net_sales');
    expect(dims.length).toBe(1); // only date is default
    expect(dims[0]!.slug).toBe('date');
  });
});

describe('validatePlan', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns valid=true for a good plan', async () => {
    const result = await validatePlan(['net_sales'], ['date']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.metrics[0]!.slug).toBe('net_sales');
    expect(result.dimensions[0]!.slug).toBe('date');
  });

  it('returns error for unknown metric slug', async () => {
    const result = await validatePlan(['unknown_metric'], ['date']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown metric'))).toBe(true);
  });

  it('returns error for unknown dimension slug', async () => {
    const result = await validatePlan(['net_sales'], ['unknown_dim']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown dimension'))).toBe(true);
  });

  it('detects incompatible metrics', async () => {
    const result = await validatePlan(['items_sold', 'avg_order_value'], []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('incompatible') || e.includes('cannot be combined'))).toBe(true);
  });

  it('detects missing required dimension', async () => {
    // order_count requires date in our test cache
    const result = await validatePlan(['order_count'], []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires') && e.includes('date'))).toBe(true);
  });

  it('respects lens metric restriction', async () => {
    // core_sales lens only allows net_sales and order_count — not rounds_played
    const result = await validatePlan(['rounds_played'], ['date'], { lensSlug: 'core_sales' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not allowed in lens'))).toBe(true);
  });

  it('respects lens dimension restriction', async () => {
    // core_sales lens only allows date and location — not golf_course
    const result = await validatePlan(['net_sales'], ['golf_course'], { lensSlug: 'core_sales' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not allowed in lens'))).toBe(true);
  });

  it('skipDimensionCheck bypasses required dimension validation', async () => {
    // order_count requires date, but skipDimensionCheck=true
    const result = await validatePlan(['order_count'], [], { skipDimensionCheck: true });
    expect(result.valid).toBe(true);
  });
});

describe('buildRegistryCatalog', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(makeCache());
  });

  it('returns catalog with metrics, dimensions, lenses, and generatedAt', async () => {
    const catalog = await buildRegistryCatalog();
    expect(Array.isArray(catalog.metrics)).toBe(true);
    expect(Array.isArray(catalog.dimensions)).toBe(true);
    expect(Array.isArray(catalog.lenses)).toBe(true);
    expect(typeof catalog.generatedAt).toBe('string');
  });

  it('filters catalog by domain', async () => {
    const catalog = await buildRegistryCatalog('golf');
    expect(catalog.metrics.every((m) => m.domain === 'golf')).toBe(true);
    expect(catalog.dimensions.every((d) => d.domain === 'golf')).toBe(true);
    expect(catalog.lenses.every((l) => l.domain === 'golf')).toBe(true);
  });
});

describe('invalidateRegistryCache', () => {
  it('forces cache reload on next access', async () => {
    setRegistryCache(makeCache());

    // First access returns cached data
    const m1 = await getMetric('net_sales');
    expect(m1.slug).toBe('net_sales');

    // Invalidate + set new cache with different data
    invalidateRegistryCache();
    const newCache = makeCache();
    newCache.metrics.set('net_sales', makeMetric({ displayName: 'Updated Sales' }));
    setRegistryCache(newCache);

    const m2 = await getMetric('net_sales');
    expect(m2.displayName).toBe('Updated Sales');
  });
});
