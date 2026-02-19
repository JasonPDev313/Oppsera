import { describe, it, expect } from 'vitest';
import {
  formatBasisPoints,
  formatGolfMoney,
  formatDuration,
  formatRoundCount,
  formatComparisonDelta,
  bpsStatus,
  formatDateShort,
} from '../lib/golf-formatters';

// ═══════════════════════════════════════════════════════════════
// formatBasisPoints
// ═══════════════════════════════════════════════════════════════

describe('formatBasisPoints', () => {
  it('formats typical utilization value', () => {
    expect(formatBasisPoints(8532)).toBe('85.3%');
  });

  it('formats 100%', () => {
    expect(formatBasisPoints(10000)).toBe('100.0%');
  });

  it('formats 0%', () => {
    expect(formatBasisPoints(0)).toBe('0.0%');
  });

  it('returns dash for null', () => {
    expect(formatBasisPoints(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(formatBasisPoints(undefined)).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatGolfMoney (dollars, NOT cents)
// ═══════════════════════════════════════════════════════════════

describe('formatGolfMoney', () => {
  it('formats typical revenue', () => {
    expect(formatGolfMoney(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatGolfMoney(0)).toBe('$0.00');
  });

  it('formats large values', () => {
    expect(formatGolfMoney(123456.78)).toBe('$123,456.78');
  });

  it('returns dash for null', () => {
    expect(formatGolfMoney(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(formatGolfMoney(undefined)).toBe('—');
  });

  it('does NOT divide by 100 (golf values are already dollars)', () => {
    // If this were cents, $45.00 would become $0.45
    expect(formatGolfMoney(45)).toBe('$45.00');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatDuration
// ═══════════════════════════════════════════════════════════════

describe('formatDuration', () => {
  it('formats minutes < 60', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats exactly 60 minutes', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats > 60 minutes with remainder', () => {
    expect(formatDuration(255)).toBe('4h 15m');
  });

  it('formats exact hours', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('returns dash for null', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(formatDuration(undefined)).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatRoundCount
// ═══════════════════════════════════════════════════════════════

describe('formatRoundCount', () => {
  it('formats with comma separators', () => {
    expect(formatRoundCount(1234)).toBe('1,234');
  });

  it('handles zero', () => {
    expect(formatRoundCount(0)).toBe('0');
  });

  it('returns dash for null', () => {
    expect(formatRoundCount(null)).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatComparisonDelta
// ═══════════════════════════════════════════════════════════════

describe('formatComparisonDelta', () => {
  it('positive change', () => {
    const result = formatComparisonDelta(120, 100);
    expect(result.direction).toBe('up');
    expect(result.text).toBe('+20%');
  });

  it('negative change', () => {
    const result = formatComparisonDelta(80, 100);
    expect(result.direction).toBe('down');
    expect(result.text).toBe('-20%');
  });

  it('no change', () => {
    const result = formatComparisonDelta(100, 100);
    expect(result.direction).toBe('flat');
    expect(result.text).toBe('0%');
  });

  it('handles zero previous value', () => {
    const result = formatComparisonDelta(50, 0);
    expect(result.direction).toBe('up');
    expect(result.text).toBe('+100%');
  });

  it('handles both zero', () => {
    const result = formatComparisonDelta(0, 0);
    expect(result.direction).toBe('flat');
    expect(result.text).toBe('0%');
  });
});

// ═══════════════════════════════════════════════════════════════
// bpsStatus
// ═══════════════════════════════════════════════════════════════

describe('bpsStatus', () => {
  it('returns ok when above thresholds (below mode)', () => {
    expect(bpsStatus(8000, 7000, 5000, 'below')).toBe('ok');
  });

  it('returns warning when at warn threshold (below mode)', () => {
    expect(bpsStatus(7000, 7000, 5000, 'below')).toBe('warning');
  });

  it('returns critical when at critical threshold (below mode)', () => {
    expect(bpsStatus(5000, 7000, 5000, 'below')).toBe('critical');
  });

  it('returns ok when below thresholds (above mode)', () => {
    expect(bpsStatus(1000, 1500, 2500, 'above')).toBe('ok');
  });

  it('returns warning when at warn threshold (above mode)', () => {
    expect(bpsStatus(1500, 1500, 2500, 'above')).toBe('warning');
  });

  it('returns critical when at critical threshold (above mode)', () => {
    expect(bpsStatus(2500, 1500, 2500, 'above')).toBe('critical');
  });

  it('returns ok for null', () => {
    expect(bpsStatus(null, 7000, 5000)).toBe('ok');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatDateShort
// ═══════════════════════════════════════════════════════════════

describe('formatDateShort', () => {
  it('formats YYYY-MM-DD to short label', () => {
    const result = formatDateShort('2026-03-15');
    expect(result).toBe('Mar 15');
  });
});
