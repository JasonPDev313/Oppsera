import { describe, it, expect } from 'vitest';
import {
  computeDateRange,
  detectPreset,
  shiftDateRange,
  formatDateISO,
  DATE_PRESET_OPTIONS,
  DEFAULT_PRESET,
} from '../lib/date-presets';
import type { DatePreset } from '../lib/date-presets';

// Fixed reference: Wednesday 2026-02-18
const REF = new Date(2026, 1, 18); // months are 0-based

describe('formatDateISO', () => {
  it('formats date to YYYY-MM-DD', () => {
    expect(formatDateISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('computeDateRange', () => {
  it('today → same day', () => {
    const r = computeDateRange('today', REF);
    expect(r).toEqual({ from: '2026-02-18', to: '2026-02-18' });
  });

  it('yesterday → previous day', () => {
    const r = computeDateRange('yesterday', REF);
    expect(r).toEqual({ from: '2026-02-17', to: '2026-02-17' });
  });

  it('week_to_date → Monday through today (Wed)', () => {
    const r = computeDateRange('week_to_date', REF);
    expect(r).toEqual({ from: '2026-02-16', to: '2026-02-18' });
  });

  it('week_to_date on a Monday → single day', () => {
    const monday = new Date(2026, 1, 16);
    const r = computeDateRange('week_to_date', monday);
    expect(r).toEqual({ from: '2026-02-16', to: '2026-02-16' });
  });

  it('week_to_date on a Sunday → full week', () => {
    const sunday = new Date(2026, 1, 22);
    const r = computeDateRange('week_to_date', sunday);
    expect(r).toEqual({ from: '2026-02-16', to: '2026-02-22' });
  });

  it('month_to_date → 1st of month through today', () => {
    const r = computeDateRange('month_to_date', REF);
    expect(r).toEqual({ from: '2026-02-01', to: '2026-02-18' });
  });

  it('year_to_date → Jan 1 through today', () => {
    const r = computeDateRange('year_to_date', REF);
    expect(r).toEqual({ from: '2026-01-01', to: '2026-02-18' });
  });

  it('last_week → previous Monday to Sunday', () => {
    const r = computeDateRange('last_week', REF);
    expect(r).toEqual({ from: '2026-02-09', to: '2026-02-15' });
  });

  it('last_month → full previous month', () => {
    const r = computeDateRange('last_month', REF);
    expect(r).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('last_month in January → December of prior year', () => {
    const jan = new Date(2026, 0, 15);
    const r = computeDateRange('last_month', jan);
    expect(r).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('last_year → full prior calendar year', () => {
    const r = computeDateRange('last_year', REF);
    expect(r).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('last_7_days → 6 days ago through today', () => {
    const r = computeDateRange('last_7_days', REF);
    expect(r).toEqual({ from: '2026-02-12', to: '2026-02-18' });
  });

  it('last_30_days → 29 days ago through today', () => {
    const r = computeDateRange('last_30_days', REF);
    expect(r).toEqual({ from: '2026-01-20', to: '2026-02-18' });
  });

  it('last_365_days → 364 days ago through today', () => {
    const r = computeDateRange('last_365_days', REF);
    expect(r).toEqual({ from: '2025-02-19', to: '2026-02-18' });
  });

  it('custom throws', () => {
    expect(() => computeDateRange('custom', REF)).toThrow('Cannot compute');
  });
});

describe('detectPreset', () => {
  it('detects all non-custom presets', () => {
    const presets: DatePreset[] = [
      'today', 'yesterday', 'week_to_date', 'month_to_date', 'year_to_date',
      'last_week', 'last_month', 'last_year',
      'last_7_days', 'last_30_days', 'last_365_days',
    ];
    for (const p of presets) {
      const range = computeDateRange(p, REF);
      expect(detectPreset(range.from, range.to, REF)).toBe(p);
    }
  });

  it('returns custom for non-matching range', () => {
    expect(detectPreset('2026-01-05', '2026-01-10', REF)).toBe('custom');
  });

  it('returns custom for arbitrary dates', () => {
    expect(detectPreset('2020-06-01', '2020-06-15', REF)).toBe('custom');
  });
});

describe('shiftDateRange', () => {
  it('shifts today forward by 1 day', () => {
    const r = shiftDateRange('2026-02-18', '2026-02-18', 'today', 'forward');
    expect(r).toEqual({ from: '2026-02-19', to: '2026-02-19' });
  });

  it('shifts today backward by 1 day', () => {
    const r = shiftDateRange('2026-02-18', '2026-02-18', 'today', 'back');
    expect(r).toEqual({ from: '2026-02-17', to: '2026-02-17' });
  });

  it('shifts last_7_days forward by 7', () => {
    const r = shiftDateRange('2026-02-12', '2026-02-18', 'last_7_days', 'forward');
    expect(r).toEqual({ from: '2026-02-19', to: '2026-02-25' });
  });

  it('shifts last_7_days backward by 7', () => {
    const r = shiftDateRange('2026-02-12', '2026-02-18', 'last_7_days', 'back');
    expect(r).toEqual({ from: '2026-02-05', to: '2026-02-11' });
  });

  it('shifts last_30_days forward by 31 (range length)', () => {
    // last_30_days = 30 days inclusive, so shift = 30
    const r = shiftDateRange('2026-01-20', '2026-02-18', 'last_30_days', 'forward');
    expect(r.from).toBe('2026-02-19');
  });

  it('shifts last_365_days backward by 365', () => {
    const r = shiftDateRange('2025-02-19', '2026-02-18', 'last_365_days', 'back');
    expect(r.from).toBe('2024-02-20');
    expect(r.to).toBe('2025-02-18');
  });

  it('shifts custom range by range length', () => {
    // 10-day range: Jan 5 to Jan 14 (10 days inclusive)
    const r = shiftDateRange('2026-01-05', '2026-01-14', 'custom', 'forward');
    expect(r).toEqual({ from: '2026-01-15', to: '2026-01-24' });
  });

  it('shifts across month boundary', () => {
    const r = shiftDateRange('2026-01-29', '2026-01-31', 'custom', 'forward');
    expect(r).toEqual({ from: '2026-02-01', to: '2026-02-03' });
  });

  it('shifts across year boundary', () => {
    const r = shiftDateRange('2025-12-30', '2025-12-31', 'yesterday', 'forward');
    expect(r).toEqual({ from: '2025-12-31', to: '2026-01-01' });
  });
});

describe('constants', () => {
  it('DEFAULT_PRESET is month_to_date', () => {
    expect(DEFAULT_PRESET).toBe('month_to_date');
  });

  it('DATE_PRESET_OPTIONS has 12 entries', () => {
    expect(DATE_PRESET_OPTIONS).toHaveLength(12);
  });

  it('all preset options have required fields', () => {
    for (const opt of DATE_PRESET_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(['relative', 'to_date', 'prior_period']).toContain(opt.group);
    }
  });
});
