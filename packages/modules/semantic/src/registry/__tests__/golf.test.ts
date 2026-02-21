import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB (no live DB calls) ────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  semanticMetrics: { isActive: 'is_active' },
  semanticDimensions: { isActive: 'is_active' },
  semanticMetricDimensions: {},
  semanticLenses: { isActive: 'is_active' },
  semanticEvalExamples: {},
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'TEST_ULID'),
}));

import {
  GOLF_METRICS,
  GOLF_DIMENSIONS,
  GOLF_METRIC_DIMENSIONS,
  CORE_DIMENSIONS,
  SYSTEM_LENSES,
} from '../seed-data';
import {
  GOLF_EXAMPLES,
  toEvalExampleInserts,
  type GolfExampleSeed,
} from '../golf-examples';
import {
  validatePlan,
  invalidateRegistryCache,
  setRegistryCache,
} from '../registry';
import type { RegistryCache } from '../registry';
import type { MetricDef, DimensionDef, LensDef } from '../types';

// ── Helpers ──────────────────────────────────────────────────────

function golfCache(): RegistryCache {
  const metrics = new Map<string, MetricDef>();
  for (const m of GOLF_METRICS) {
    metrics.set(m.slug, { ...m, isActive: true, isExperimental: false });
  }

  const dimensions = new Map<string, DimensionDef>();

  // Golf metric-dimension relations reference the core 'date' dimension — include it
  const allDimensions = [
    ...GOLF_DIMENSIONS,
    ...CORE_DIMENSIONS.filter((d) => d.slug === 'date'),
  ];

  for (const d of allDimensions) {
    dimensions.set(d.slug, {
      ...d,
      isActive: true,
      sqlCast: null,
      hierarchyParent: null,
      hierarchyLevel: 0,
      isTimeDimension: d.isTimeDimension ?? false,
      timeGranularities: d.timeGranularities ?? null,
      tags: null,
      description: d.description ?? null,
      category: d.category ?? null,
      lookupTable: d.lookupTable ?? null,
      lookupKeyColumn: d.lookupKeyColumn ?? null,
      lookupLabelColumn: d.lookupLabelColumn ?? null,
      exampleValues: (d as { exampleValues?: string[] }).exampleValues ?? null,
      examplePhrases: d.examplePhrases ?? null,
    });
  }

  const lenses = new Map<string, LensDef>();
  for (const l of SYSTEM_LENSES) {
    lenses.set(l.slug, { ...l, isActive: true });
  }

  return {
    metrics,
    dimensions,
    relations: [...GOLF_METRIC_DIMENSIONS],
    lenses,
    loadedAt: Date.now(),
  };
}

// ── Golf Seed Data: Metrics ───────────────────────────────────────

describe('GOLF_METRICS seed data', () => {
  it('contains exactly 8 metrics', () => {
    expect(GOLF_METRICS).toHaveLength(8);
  });

  it('all metrics have required golf domain', () => {
    for (const m of GOLF_METRICS) {
      expect(m.domain).toBe('golf');
    }
  });

  it('includes expected metric slugs', () => {
    const slugs = GOLF_METRICS.map((m) => m.slug);
    expect(slugs).toContain('rounds_played');
    expect(slugs).toContain('green_fee_revenue');
    expect(slugs).toContain('revenue_per_round');
    expect(slugs).toContain('utilization_rate');
    expect(slugs).toContain('avg_pace_of_play');
    expect(slugs).toContain('total_golf_revenue');
    expect(slugs).toContain('cart_revenue');
    expect(slugs).toContain('available_tee_times');
  });

  it('utilization_rate has requiresDimensions = ["date"]', () => {
    const util = GOLF_METRICS.find((m) => m.slug === 'utilization_rate');
    expect(util?.requiresDimensions).toEqual(['date']);
  });

  it('currency metrics use $0,0.00 format pattern', () => {
    const currencyMetrics = GOLF_METRICS.filter((m) => m.dataType === 'currency');
    for (const m of currencyMetrics) {
      expect(m.formatPattern).toBe('$0,0.00');
      expect(m.unit).toBe('USD');
    }
  });

  it('avg_pace_of_play has higherIsBetter = false', () => {
    const pace = GOLF_METRICS.find((m) => m.slug === 'avg_pace_of_play');
    expect(pace?.higherIsBetter).toBe(false);
  });

  it('all slugs are unique', () => {
    const slugs = GOLF_METRICS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('all metrics have at least one alias', () => {
    for (const m of GOLF_METRICS) {
      expect(m.aliases).not.toBeNull();
      expect((m.aliases ?? []).length).toBeGreaterThan(0);
    }
  });
});

// ── Golf Seed Data: Dimensions ────────────────────────────────────

describe('GOLF_DIMENSIONS seed data', () => {
  it('contains exactly 6 dimensions', () => {
    expect(GOLF_DIMENSIONS).toHaveLength(6);
  });

  it('all dimensions belong to golf domain', () => {
    for (const d of GOLF_DIMENSIONS) {
      expect(d.domain).toBe('golf');
    }
  });

  it('includes expected dimension slugs', () => {
    const slugs = GOLF_DIMENSIONS.map((d) => d.slug);
    expect(slugs).toContain('golf_course');
    expect(slugs).toContain('booking_channel');
    expect(slugs).toContain('daypart');
    expect(slugs).toContain('player_type');
    expect(slugs).toContain('holes');
    expect(slugs).toContain('day_of_week');
  });

  it('all slugs are unique', () => {
    const slugs = GOLF_DIMENSIONS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('holes dimension has example values 9 and 18', () => {
    const holes = GOLF_DIMENSIONS.find((d) => d.slug === 'holes');
    expect(holes?.exampleValues).toContain('9');
    expect(holes?.exampleValues).toContain('18');
  });

  it('day_of_week has all 7 days as example values', () => {
    const dow = GOLF_DIMENSIONS.find((d) => d.slug === 'day_of_week');
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const day of days) {
      expect(dow?.exampleValues).toContain(day);
    }
  });

  it('daypart has morning/afternoon/twilight values', () => {
    const daypart = GOLF_DIMENSIONS.find((d) => d.slug === 'daypart');
    expect(daypart?.exampleValues).toContain('morning');
    expect(daypart?.exampleValues).toContain('afternoon');
    expect(daypart?.exampleValues).toContain('twilight');
  });

  it('player_type has member/guest example values', () => {
    const pt = GOLF_DIMENSIONS.find((d) => d.slug === 'player_type');
    expect(pt?.exampleValues).toContain('member');
    expect(pt?.exampleValues).toContain('guest');
  });
});

// ── Golf Metric–Dimension Relations ──────────────────────────────

describe('GOLF_METRIC_DIMENSIONS relations', () => {
  it('utilization_rate has date as required dimension', () => {
    const rel = GOLF_METRIC_DIMENSIONS.find(
      (r) => r.metricSlug === 'utilization_rate' && r.dimensionSlug === 'date',
    );
    expect(rel).toBeDefined();
    expect(rel?.isRequired).toBe(true);
  });

  it('rounds_played has date as default dimension', () => {
    const rel = GOLF_METRIC_DIMENSIONS.find(
      (r) => r.metricSlug === 'rounds_played' && r.dimensionSlug === 'date',
    );
    expect(rel).toBeDefined();
    expect(rel?.isDefault).toBe(true);
    expect(rel?.sortOrder).toBe(0);
  });

  it('rounds_played supports all golf dimensions', () => {
    const dims = GOLF_METRIC_DIMENSIONS
      .filter((r) => r.metricSlug === 'rounds_played')
      .map((r) => r.dimensionSlug);
    expect(dims).toContain('golf_course');
    expect(dims).toContain('booking_channel');
    expect(dims).toContain('daypart');
    expect(dims).toContain('player_type');
    expect(dims).toContain('day_of_week');
    expect(dims).toContain('holes');
  });

  it('cart_revenue has date, golf_course, and player_type dimensions', () => {
    const dims = GOLF_METRIC_DIMENSIONS
      .filter((r) => r.metricSlug === 'cart_revenue')
      .map((r) => r.dimensionSlug);
    expect(dims).toContain('date');
    expect(dims).toContain('golf_course');
    expect(dims).toContain('player_type');
  });

  it('available_tee_times has date, golf_course, and daypart dimensions', () => {
    const dims = GOLF_METRIC_DIMENSIONS
      .filter((r) => r.metricSlug === 'available_tee_times')
      .map((r) => r.dimensionSlug);
    expect(dims).toContain('date');
    expect(dims).toContain('golf_course');
    expect(dims).toContain('daypart');
  });

  it('no duplicate (metricSlug, dimensionSlug) pairs', () => {
    const seen = new Set<string>();
    for (const r of GOLF_METRIC_DIMENSIONS) {
      const key = `${r.metricSlug}::${r.dimensionSlug}`;
      expect(seen.has(key), `Duplicate relation: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('all referenced metric slugs exist in GOLF_METRICS', () => {
    const validSlugs = new Set(GOLF_METRICS.map((m) => m.slug));
    for (const r of GOLF_METRIC_DIMENSIONS) {
      expect(validSlugs.has(r.metricSlug), `Unknown metric slug: ${r.metricSlug}`).toBe(true);
    }
  });

  it('all referenced dimension slugs exist in GOLF_DIMENSIONS or CORE_DIMENSIONS', () => {
    // Golf relations may reference cross-domain dims (e.g. 'date' from CORE_DIMENSIONS)
    const validSlugs = new Set([
      ...GOLF_DIMENSIONS.map((d) => d.slug),
      ...CORE_DIMENSIONS.map((d) => d.slug),
    ]);
    for (const r of GOLF_METRIC_DIMENSIONS) {
      expect(validSlugs.has(r.dimensionSlug), `Unknown dimension slug: ${r.dimensionSlug}`).toBe(true);
    }
  });
});

// ── System Lenses: Golf ───────────────────────────────────────────

describe('SYSTEM_LENSES golf entries', () => {
  const golfLenses = SYSTEM_LENSES.filter((l) => l.domain === 'golf');

  it('has exactly 2 golf lenses', () => {
    expect(golfLenses).toHaveLength(2);
  });

  it('golf_operations lens exists with correct allowed metrics', () => {
    const lens = SYSTEM_LENSES.find((l) => l.slug === 'golf_operations');
    expect(lens).toBeDefined();
    expect(lens?.allowedMetrics).toContain('rounds_played');
    expect(lens?.allowedMetrics).toContain('utilization_rate');
    expect(lens?.allowedMetrics).toContain('avg_pace_of_play');
  });

  it('golf_revenue lens includes cart_revenue and day_of_week', () => {
    const lens = SYSTEM_LENSES.find((l) => l.slug === 'golf_revenue');
    expect(lens?.allowedMetrics).toContain('cart_revenue');
    expect(lens?.allowedDimensions).toContain('day_of_week');
  });

  it('golf_operations lens prompt mentions utilization_rate required date', () => {
    const lens = SYSTEM_LENSES.find((l) => l.slug === 'golf_operations');
    expect(lens?.systemPromptFragment).toMatch(/utilization_rate/);
    expect(lens?.systemPromptFragment).toMatch(/date/);
    expect(lens?.systemPromptFragment).toMatch(/required/);
  });

  it('all golf lenses are system lenses', () => {
    for (const l of golfLenses) {
      expect(l.isSystem).toBe(true);
    }
  });

  it('all golf lens slugs are unique', () => {
    const slugs = golfLenses.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

// ── Plan Validation: Golf-specific rules ──────────────────────────

describe('validatePlan — golf-specific', () => {
  beforeEach(() => {
    invalidateRegistryCache();
    setRegistryCache(golfCache());
  });

  it('validates a basic golf plan', async () => {
    const result = await validatePlan(['rounds_played'], ['date']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unknown golf metric', async () => {
    const result = await validatePlan(['unknown_golf_metric'], ['date']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown metric'))).toBe(true);
  });

  it('rejects unknown golf dimension', async () => {
    const result = await validatePlan(['rounds_played'], ['unknown_dim']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown dimension'))).toBe(true);
  });

  it('detects missing required date dimension for utilization_rate', async () => {
    const result = await validatePlan(['utilization_rate'], []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires') && e.includes('date'))).toBe(true);
  });

  it('accepts utilization_rate when date dimension is included', async () => {
    const result = await validatePlan(['utilization_rate'], ['date']);
    expect(result.valid).toBe(true);
  });

  it('accepts utilization_rate with golf_course + date', async () => {
    const result = await validatePlan(['utilization_rate'], ['date', 'golf_course']);
    expect(result.valid).toBe(true);
  });

  it('golf_operations lens restricts to allowed metrics only', async () => {
    // total_golf_revenue is NOT in golf_operations lens
    const result = await validatePlan(['total_golf_revenue'], ['date'], { lensSlug: 'golf_operations' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not allowed in lens'))).toBe(true);
  });

  it('golf_revenue lens allows cart_revenue', async () => {
    const result = await validatePlan(['cart_revenue'], ['date'], { lensSlug: 'golf_revenue' });
    expect(result.valid).toBe(true);
  });

  it('golf_revenue lens allows day_of_week dimension', async () => {
    const result = await validatePlan(['rounds_played'], ['day_of_week'], { lensSlug: 'golf_revenue' });
    expect(result.valid).toBe(true);
  });

  it('golf_operations lens restricts dimensions — holes not allowed', async () => {
    // holes is NOT in golf_operations allowedDimensions
    const result = await validatePlan(['rounds_played'], ['holes'], { lensSlug: 'golf_operations' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not allowed in lens'))).toBe(true);
  });

  it('multi-metric plan: rounds_played + avg_pace_of_play with date is valid', async () => {
    const result = await validatePlan(['rounds_played', 'avg_pace_of_play'], ['date']);
    expect(result.valid).toBe(true);
  });

  it('multi-metric plan: rounds_played + green_fee_revenue with booking_channel is valid', async () => {
    const result = await validatePlan(['rounds_played', 'green_fee_revenue'], ['booking_channel']);
    expect(result.valid).toBe(true);
  });
});

// ── Golf Examples ─────────────────────────────────────────────────

describe('GOLF_EXAMPLES', () => {
  it('contains exactly 8 examples', () => {
    expect(GOLF_EXAMPLES).toHaveLength(8);
  });

  it('all examples have golf category', () => {
    for (const ex of GOLF_EXAMPLES) {
      expect(ex.category).toBe('golf');
    }
  });

  it('covers all three difficulty levels', () => {
    const difficulties = new Set(GOLF_EXAMPLES.map((e) => e.difficulty));
    expect(difficulties).toContain('simple');
    expect(difficulties).toContain('medium');
    expect(difficulties).toContain('complex');
  });

  it('simple examples: 2, medium: 3, complex: 3', () => {
    const byDiff = GOLF_EXAMPLES.reduce(
      (acc, e) => {
        acc[e.difficulty] = (acc[e.difficulty] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    expect(byDiff['simple']).toBe(2);
    expect(byDiff['medium']).toBe(3);
    expect(byDiff['complex']).toBe(3);
  });

  it('all examples have non-empty questions', () => {
    for (const ex of GOLF_EXAMPLES) {
      expect(ex.question.trim().length).toBeGreaterThan(0);
    }
  });

  it('all questions are unique', () => {
    const questions = GOLF_EXAMPLES.map((e) => e.question);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it('all plans have metrics array', () => {
    for (const ex of GOLF_EXAMPLES) {
      expect(Array.isArray(ex.plan['metrics'])).toBe(true);
      expect((ex.plan['metrics'] as string[]).length).toBeGreaterThan(0);
    }
  });

  it('all plans have dateRange with start and end', () => {
    for (const ex of GOLF_EXAMPLES) {
      const dr = ex.plan['dateRange'] as { start: string; end: string } | undefined;
      expect(dr).toBeDefined();
      expect(dr?.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dr?.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('all plans use only known golf metric slugs', () => {
    const validSlugs = new Set(GOLF_METRICS.map((m) => m.slug));
    for (const ex of GOLF_EXAMPLES) {
      const metrics = ex.plan['metrics'] as string[];
      for (const slug of metrics) {
        expect(validSlugs.has(slug), `Unknown metric slug in example: ${slug}`).toBe(true);
      }
    }
  });

  it('all plans with dimensions use only known dimension slugs', () => {
    // Golf examples may use core dims (e.g. 'date') alongside golf-specific ones
    const validSlugs = new Set([
      ...GOLF_DIMENSIONS.map((d) => d.slug),
      ...CORE_DIMENSIONS.map((d) => d.slug),
    ]);
    for (const ex of GOLF_EXAMPLES) {
      const dims = ex.plan['dimensions'] as string[];
      for (const slug of dims) {
        expect(validSlugs.has(slug), `Unknown dimension slug in example: ${slug}`).toBe(true);
      }
    }
  });

  it('all examples have rationale with at least one key', () => {
    for (const ex of GOLF_EXAMPLES) {
      expect(Object.keys(ex.rationale).length).toBeGreaterThan(0);
    }
  });

  it('utilization example includes date dimension (required)', () => {
    const utilEx = GOLF_EXAMPLES.find(
      (e) => (e.plan['metrics'] as string[]).includes('utilization_rate'),
    );
    expect(utilEx).toBeDefined();
    const dims = utilEx!.plan['dimensions'] as string[];
    expect(dims).toContain('date');
  });
});

// ── toEvalExampleInserts ──────────────────────────────────────────

describe('toEvalExampleInserts', () => {
  it('converts all examples to insert format', () => {
    const inserts = toEvalExampleInserts(GOLF_EXAMPLES);
    expect(inserts).toHaveLength(GOLF_EXAMPLES.length);
  });

  it('all inserts have tenantId = null (system-level)', () => {
    const inserts = toEvalExampleInserts(GOLF_EXAMPLES);
    for (const ins of inserts) {
      expect(ins.tenantId).toBeNull();
    }
  });

  it('all inserts have qualityScore = "1.00" (hand-crafted)', () => {
    const inserts = toEvalExampleInserts(GOLF_EXAMPLES);
    for (const ins of inserts) {
      expect(ins.qualityScore).toBe('1.00');
    }
  });

  it('all inserts have isActive = true', () => {
    const inserts = toEvalExampleInserts(GOLF_EXAMPLES);
    for (const ins of inserts) {
      expect(ins.isActive).toBe(true);
    }
  });

  it('all inserts have sourceEvalTurnId = null', () => {
    const inserts = toEvalExampleInserts(GOLF_EXAMPLES);
    for (const ins of inserts) {
      expect(ins.sourceEvalTurnId).toBeNull();
    }
  });

  it('preserves question, plan, rationale, category, difficulty', () => {
    const inserts = toEvalExampleInserts(GOLF_EXAMPLES);
    for (let i = 0; i < GOLF_EXAMPLES.length; i++) {
      const src = GOLF_EXAMPLES[i]!;
      const ins = inserts[i]!;
      expect(ins.question).toBe(src.question);
      expect(ins.plan).toEqual(src.plan);
      expect(ins.rationale).toEqual(src.rationale);
      expect(ins.category).toBe(src.category);
      expect(ins.difficulty).toBe(src.difficulty);
    }
  });

  it('handles empty array input', () => {
    const inserts = toEvalExampleInserts([]);
    expect(inserts).toHaveLength(0);
  });

  it('handles partial example array', () => {
    const subset: GolfExampleSeed[] = [GOLF_EXAMPLES[0]!, GOLF_EXAMPLES[1]!];
    const inserts = toEvalExampleInserts(subset);
    expect(inserts).toHaveLength(2);
  });
});
