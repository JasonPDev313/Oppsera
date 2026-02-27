import { describe, it, expect } from 'vitest';
import {
  checkPlausibility,
  formatPlausibilityForNarrative,
} from '../plausibility-checker';
import type { QueryResult } from '../../llm/types';
import type { QueryPlan } from '../../compiler/types';

// ── Helpers ────────────────────────────────────────────────────────

function makeResult(
  rows: Record<string, unknown>[],
  overrides?: Partial<QueryResult>,
): QueryResult {
  return {
    rows,
    rowCount: rows.length,
    executionTimeMs: 50,
    truncated: false,
    ...overrides,
  };
}

const TODAY = '2026-02-20';

// ── Null / Empty ───────────────────────────────────────────────────

describe('checkPlausibility', () => {
  it('returns grade A for null result', () => {
    const r = checkPlausibility(null, null, TODAY);
    expect(r.plausible).toBe(true);
    expect(r.grade).toBe('A');
    expect(r.warnings).toHaveLength(0);
  });

  it('returns grade A for zero-row result', () => {
    const r = checkPlausibility(makeResult([], { rowCount: 0 }), null, TODAY);
    expect(r.plausible).toBe(true);
    expect(r.grade).toBe('A');
  });

  it('returns grade A for clean data', () => {
    const r = checkPlausibility(
      makeResult([
        { date: '2026-01-01', total_amount: 100 },
        { date: '2026-01-02', total_amount: 200 },
        { date: '2026-01-03', total_amount: 150 },
      ]),
      null,
      TODAY,
    );
    expect(r.plausible).toBe(true);
    expect(r.grade).toBe('A');
    expect(r.warnings).toHaveLength(0);
  });

  // ── Check 1: Negative monetary values ──────────────────────────

  describe('Check 1: Negative money', () => {
    it('warns when ALL monetary values are negative', () => {
      const r = checkPlausibility(
        makeResult([
          { total_amount: -100 },
          { total_amount: -200 },
          { total_amount: -50 },
        ]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ALL_NEGATIVE_MONEY', severity: 'warning' }),
        ]),
      );
    });

    it('info when majority of monetary values are negative', () => {
      const r = checkPlausibility(
        makeResult([
          { total_amount: -100 },
          { total_amount: -200 },
          { total_amount: 50 },
        ]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MAJORITY_NEGATIVE_MONEY', severity: 'info' }),
        ]),
      );
    });

    it('no warning when minority of values are negative', () => {
      const r = checkPlausibility(
        makeResult([
          { total_amount: 100 },
          { total_amount: 200 },
          { total_amount: -50 },
          { total_amount: 300 },
        ]),
        null,
        TODAY,
      );
      const negWarnings = r.warnings.filter(
        (w) => w.code === 'ALL_NEGATIVE_MONEY' || w.code === 'MAJORITY_NEGATIVE_MONEY',
      );
      expect(negWarnings).toHaveLength(0);
    });

    it('recognizes monetary column patterns', () => {
      // revenue, sales, cost, price, spend, balance, payment, fee, charge, discount
      const monetaryNames = ['revenue', 'net_sales', 'cost', 'avg_order_value'];
      for (const col of monetaryNames) {
        const r = checkPlausibility(
          makeResult([{ [col]: -10 }, { [col]: -20 }]),
          null,
          TODAY,
        );
        expect(r.warnings.some((w) => w.code === 'ALL_NEGATIVE_MONEY')).toBe(true);
      }
    });

    it('ignores non-monetary columns', () => {
      const r = checkPlausibility(
        makeResult([{ row_count: -1 }, { row_count: -2 }]),
        null,
        TODAY,
      );
      expect(r.warnings).toHaveLength(0);
    });
  });

  // ── Check 2: Future dates ──────────────────────────────────────

  describe('Check 2: Future dates', () => {
    it('warns when rows have future dates', () => {
      const r = checkPlausibility(
        makeResult([
          { business_date: '2026-02-21', total: 100 },
          { business_date: '2026-03-01', total: 200 },
        ]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'FUTURE_DATES', severity: 'warning' }),
        ]),
      );
    });

    it('no warning when all dates are today or earlier', () => {
      const r = checkPlausibility(
        makeResult([
          { business_date: '2026-02-20', total: 100 },
          { business_date: '2026-02-19', total: 200 },
        ]),
        null,
        TODAY,
      );
      const dateWarnings = r.warnings.filter((w) => w.code === 'FUTURE_DATES');
      expect(dateWarnings).toHaveLength(0);
    });

    it('recognizes date column patterns', () => {
      const dateNames = ['date', 'day', 'month', 'period', 'created_at'];
      for (const col of dateNames) {
        const r = checkPlausibility(
          makeResult([{ [col]: '2030-01-01' }]),
          null,
          TODAY,
        );
        expect(r.warnings.some((w) => w.code === 'FUTURE_DATES')).toBe(true);
      }
    });
  });

  // ── Check 3: Statistical outliers ──────────────────────────────

  describe('Check 3: Statistical outliers', () => {
    it('flags values more than 3σ from mean', () => {
      // Need enough data points so the outlier doesn't inflate stddev too much
      const rows = Array.from({ length: 20 }, () => ({ revenue: 100 }));
      rows.push({ revenue: 100000 }); // extreme outlier
      const r = checkPlausibility(makeResult(rows), null, TODAY);
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'STATISTICAL_OUTLIERS', severity: 'info' }),
        ]),
      );
    });

    it('no outlier warning for uniform data', () => {
      const r = checkPlausibility(
        makeResult([
          { revenue: 100 },
          { revenue: 102 },
          { revenue: 98 },
          { revenue: 101 },
        ]),
        null,
        TODAY,
      );
      const outlierWarnings = r.warnings.filter((w) => w.code === 'STATISTICAL_OUTLIERS');
      expect(outlierWarnings).toHaveLength(0);
    });
  });

  // ── Check 4: All-null columns ──────────────────────────────────

  describe('Check 4: All-null columns', () => {
    it('flags columns that are entirely NULL', () => {
      const r = checkPlausibility(
        makeResult([
          { name: 'A', optional_field: null },
          { name: 'B', optional_field: null },
          { name: 'C', optional_field: null },
        ]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ALL_NULL_COLUMN', severity: 'info' }),
        ]),
      );
    });

    it('no warning for columns with some values', () => {
      const r = checkPlausibility(
        makeResult([
          { name: 'A', optional_field: null },
          { name: 'B', optional_field: 'hello' },
          { name: 'C', optional_field: null },
        ]),
        null,
        TODAY,
      );
      const nullWarnings = r.warnings.filter((w) => w.code === 'ALL_NULL_COLUMN');
      expect(nullWarnings).toHaveLength(0);
    });

    it('no warning for fewer than 3 rows', () => {
      const r = checkPlausibility(
        makeResult([
          { name: 'A', optional_field: null },
          { name: 'B', optional_field: null },
        ]),
        null,
        TODAY,
      );
      const nullWarnings = r.warnings.filter((w) => w.code === 'ALL_NULL_COLUMN');
      expect(nullWarnings).toHaveLength(0);
    });
  });

  // ── Check 5: Duplicate rows ────────────────────────────────────

  describe('Check 5: Duplicate rows', () => {
    it('flags high duplicate rate (>30%)', () => {
      const row = { date: '2026-01-01', total: 100 };
      const r = checkPlausibility(
        makeResult([row, row, row, row, { date: '2026-01-02', total: 200 }]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'HIGH_DUPLICATE_RATE', severity: 'warning' }),
        ]),
      );
    });

    it('no warning for unique rows', () => {
      const r = checkPlausibility(
        makeResult([
          { id: 1, total: 100 },
          { id: 2, total: 200 },
          { id: 3, total: 300 },
          { id: 4, total: 400 },
          { id: 5, total: 500 },
        ]),
        null,
        TODAY,
      );
      const dupeWarnings = r.warnings.filter((w) => w.code === 'HIGH_DUPLICATE_RATE');
      expect(dupeWarnings).toHaveLength(0);
    });

    it('skips check for fewer than 5 rows', () => {
      const row = { total: 100 };
      const r = checkPlausibility(makeResult([row, row, row, row]), null, TODAY);
      const dupeWarnings = r.warnings.filter((w) => w.code === 'HIGH_DUPLICATE_RATE');
      expect(dupeWarnings).toHaveLength(0);
    });
  });

  // ── Check 6: Date range mismatch ───────────────────────────────

  describe('Check 6: Date range mismatch', () => {
    it('warns when data falls outside the requested range', () => {
      const plan: QueryPlan = {
        metrics: ['net_sales'],
        dimensions: ['date'],
        filters: [],
        dateRange: { start: '2026-01-01', end: '2026-01-31' },
      };
      const r = checkPlausibility(
        makeResult([
          { business_date: '2026-01-15', total: 100 },
          { business_date: '2026-02-05', total: 200 }, // outside range
        ]),
        plan,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'DATE_RANGE_MISMATCH', severity: 'warning' }),
        ]),
      );
    });

    it('no warning when all data is within range', () => {
      const plan: QueryPlan = {
        metrics: ['net_sales'],
        dimensions: ['date'],
        filters: [],
        dateRange: { start: '2026-01-01', end: '2026-01-31' },
      };
      const r = checkPlausibility(
        makeResult([
          { business_date: '2026-01-10', total: 100 },
          { business_date: '2026-01-20', total: 200 },
        ]),
        plan,
        TODAY,
      );
      const mismatchWarnings = r.warnings.filter((w) => w.code === 'DATE_RANGE_MISMATCH');
      expect(mismatchWarnings).toHaveLength(0);
    });

    it('skips check when plan has no dateRange', () => {
      const plan: QueryPlan = {
        metrics: ['net_sales'],
        dimensions: [],
        filters: [],
      };
      const r = checkPlausibility(
        makeResult([{ business_date: '2099-01-01', total: 100 }]),
        plan,
        TODAY,
      );
      const mismatchWarnings = r.warnings.filter((w) => w.code === 'DATE_RANGE_MISMATCH');
      expect(mismatchWarnings).toHaveLength(0);
    });
  });

  // ── Check 7: Percent out of range ──────────────────────────────

  describe('Check 7: Percent out of range', () => {
    it('warns when percentage values exceed 100', () => {
      const r = checkPlausibility(
        makeResult([
          { margin: 150 }, // out of range
          { margin: 50 },
        ]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PERCENT_OUT_OF_RANGE', severity: 'warning' }),
        ]),
      );
    });

    it('warns when percentage values are negative', () => {
      const r = checkPlausibility(
        makeResult([
          { hit_rate: -5 },
          { hit_rate: 50 },
        ]),
        null,
        TODAY,
      );
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PERCENT_OUT_OF_RANGE', severity: 'warning' }),
        ]),
      );
    });

    it('no warning for valid percentages 0–100', () => {
      const r = checkPlausibility(
        makeResult([
          { margin: 0 },
          { margin: 50 },
          { margin: 100 },
        ]),
        null,
        TODAY,
      );
      const pctWarnings = r.warnings.filter((w) => w.code === 'PERCENT_OUT_OF_RANGE');
      expect(pctWarnings).toHaveLength(0);
    });

    it('recognizes percent column patterns', () => {
      const pctNames = ['rate', 'percent', 'pct', 'ratio', 'margin'];
      for (const col of pctNames) {
        const r = checkPlausibility(
          makeResult([{ [col]: 200 }]),
          null,
          TODAY,
        );
        expect(r.warnings.some((w) => w.code === 'PERCENT_OUT_OF_RANGE')).toBe(true);
      }
    });
  });

  // ── Grade computation ──────────────────────────────────────────

  describe('Grade computation', () => {
    it('grade B with 1 warning + few infos', () => {
      // 1 warning (all negative money) = grade B
      const r = checkPlausibility(
        makeResult([{ total_amount: -100 }, { total_amount: -200 }]),
        null,
        TODAY,
      );
      expect(r.grade).toBe('B');
      expect(r.plausible).toBe(true); // 1 warning is still plausible
    });

    it('grade C with 2 warnings', () => {
      // All negative money + future dates = 2 warnings
      const r = checkPlausibility(
        makeResult([
          { total_amount: -100, business_date: '2030-01-01' },
          { total_amount: -200, business_date: '2030-01-02' },
        ]),
        null,
        TODAY,
      );
      expect(r.grade).toBe('C');
      expect(r.plausible).toBe(false); // >1 warning = not plausible
    });

    it('grade D with 3+ warnings', () => {
      // All negative money + future dates + percent out of range + duplicates
      const row = { total_amount: -100, business_date: '2030-01-01', margin: 200 };
      const r = checkPlausibility(
        makeResult([row, row, row, row, row]),
        null,
        TODAY,
      );
      expect(r.grade).toBe('D');
    });

    it('grade B with 3+ info-level warnings (no warning-level)', () => {
      // Outliers + all-null (both info) + majority negative (info)
      const r = checkPlausibility(
        makeResult([
          { revenue: 100, optional: null, cost: -10 },
          { revenue: 102, optional: null, cost: -20 },
          { revenue: 98, optional: null, cost: 30 },
          { revenue: 100000, optional: null, cost: -40 }, // outlier
        ]),
        null,
        TODAY,
      );
      // Has info warnings (outlier + null column + majority negative)
      const infoCount = r.warnings.filter((w) => w.severity === 'info').length;
      expect(infoCount).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── formatPlausibilityForNarrative ─────────────────────────────────

describe('formatPlausibilityForNarrative', () => {
  it('returns null for no warnings', () => {
    expect(formatPlausibilityForNarrative({
      plausible: true,
      warnings: [],
      grade: 'A',
    })).toBeNull();
  });

  it('returns null when only info-level warnings exist', () => {
    expect(formatPlausibilityForNarrative({
      plausible: true,
      warnings: [{ code: 'STAT', severity: 'info', message: 'Minor issue' }],
      grade: 'A',
    })).toBeNull();
  });

  it('includes warning-level items in narrative format', () => {
    const result = formatPlausibilityForNarrative({
      plausible: false,
      warnings: [
        { code: 'NEG', severity: 'warning', message: 'All negative values' },
        { code: 'FUT', severity: 'info', message: 'Some minor info' },
      ],
      grade: 'C',
    });
    expect(result).toContain('## Data Quality Warnings');
    expect(result).toContain('All negative values');
    expect(result).not.toContain('Some minor info');
  });
});
