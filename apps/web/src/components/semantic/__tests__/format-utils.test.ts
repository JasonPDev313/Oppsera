import { describe, it, expect } from 'vitest';
import { inferColumnType, formatCellText, getStatusColor, isDeltaColumn, rowsToCsv, buildDrillPrompt } from '../format-utils';

// ═══════════════════════════════════════════════════════════════
// inferColumnType
// ═══════════════════════════════════════════════════════════════

describe('inferColumnType', () => {
  // ── Status columns ──
  it('detects status columns', () => {
    expect(inferColumnType('order_status', ['open', 'paid'])).toBe('status');
    expect(inferColumnType('state', ['active'])).toBe('status');
    expect(inferColumnType('phase', ['draft'])).toBe('status');
    expect(inferColumnType('reservation_stage', ['confirmed'])).toBe('status');
  });

  // ── Percent columns (must be checked BEFORE currency) ──
  it('detects percent columns', () => {
    expect(inferColumnType('occupancy_rate', [0.85])).toBe('percent');
    expect(inferColumnType('growth_pct', [12.5])).toBe('percent');
    expect(inferColumnType('utilization', [0.72])).toBe('percent');
    expect(inferColumnType('change', [-3.2])).toBe('percent');
  });

  it('percent beats currency for mixed-keyword columns', () => {
    // margin_pct contains both "margin" (currency) and "pct" (percent)
    expect(inferColumnType('margin_pct', [0.35])).toBe('percent');
    expect(inferColumnType('profit_growth', [15.2])).toBe('percent');
    expect(inferColumnType('revenue_change', [-2.1])).toBe('percent');
  });

  // ── Currency columns ──
  it('detects currency columns', () => {
    expect(inferColumnType('total_revenue', [1234.56])).toBe('currency');
    expect(inferColumnType('price', [9.99])).toBe('currency');
    expect(inferColumnType('subtotal', [250])).toBe('currency');
    expect(inferColumnType('tip', [5.00])).toBe('currency');
    expect(inferColumnType('net_sales', [1000])).toBe('currency');
  });

  it('excludes count/qty columns from currency', () => {
    expect(inferColumnType('total_count', [42])).toBe('number');
    expect(inferColumnType('sales_qty', [10])).toBe('number');
    expect(inferColumnType('total_items', [5])).toBe('number');
    expect(inferColumnType('payment_id', ['abc123'])).toBe('text');
    expect(inferColumnType('discount_units', [3])).toBe('number');
    expect(inferColumnType('charge_hours', [8])).toBe('number');
  });

  // ── Number columns (auto-detected from values) ──
  it('detects generic numeric columns from values', () => {
    expect(inferColumnType('guests', [2, 4, 6])).toBe('number');
    expect(inferColumnType('covers', ['10', '20', '30'])).toBe('number');
  });

  it('handles mixed null/number values', () => {
    expect(inferColumnType('quantity', [null, 5, null, 10])).toBe('number');
  });

  // ── Text columns ──
  it('falls back to text for non-numeric values', () => {
    expect(inferColumnType('name', ['Alice', 'Bob'])).toBe('text');
    expect(inferColumnType('description', ['A nice item'])).toBe('text');
  });

  it('returns text for all-null/empty values', () => {
    expect(inferColumnType('unknown', [null, null])).toBe('text');
    expect(inferColumnType('empty', ['', ''])).toBe('text');
    expect(inferColumnType('nothing', [])).toBe('text');
  });
});

// ═══════════════════════════════════════════════════════════════
// formatCellText
// ═══════════════════════════════════════════════════════════════

describe('formatCellText', () => {
  // ── Null handling ──
  it('returns null for null, undefined, empty string', () => {
    expect(formatCellText(null, 'currency')).toBeNull();
    expect(formatCellText(undefined, 'number')).toBeNull();
    expect(formatCellText('', 'text')).toBeNull();
  });

  // ── Currency formatting ──
  it('formats currency values', () => {
    expect(formatCellText(1234.56, 'currency')).toBe('$1,234.56');
    expect(formatCellText(0, 'currency')).toBe('$0.00');
    expect(formatCellText(-50, 'currency')).toBe('-$50.00');
    expect(formatCellText('999.9', 'currency')).toBe('$999.90');
  });

  it('handles non-numeric currency values gracefully', () => {
    expect(formatCellText('N/A', 'currency')).toBe('N/A');
    expect(formatCellText('free', 'currency')).toBe('free');
  });

  // ── Percent formatting ──
  it('formats already-percentage values (> 1)', () => {
    expect(formatCellText(85.5, 'percent')).toBe('85.5%');
    expect(formatCellText(100, 'percent')).toBe('100.0%');
    expect(formatCellText(2.3, 'percent')).toBe('2.3%');
  });

  it('formats ratio values (<= 1) by multiplying by 100', () => {
    expect(formatCellText(0.855, 'percent')).toBe('85.5%');
    expect(formatCellText(0.5, 'percent')).toBe('50.0%');
    expect(formatCellText(0.01, 'percent')).toBe('1.0%');
  });

  it('handles 0% correctly (does not multiply by 100)', () => {
    // 0 is a special case — Math.abs(0) === 0 !== 0 is false, so pct stays 0
    expect(formatCellText(0, 'percent')).toBe('0.0%');
  });

  it('handles negative percentages', () => {
    expect(formatCellText(-5.2, 'percent')).toBe('-5.2%');
    expect(formatCellText(-0.052, 'percent')).toBe('-5.2%');
  });

  // ── Number formatting ──
  it('formats plain numbers with commas', () => {
    expect(formatCellText(12345, 'number')).toBe('12,345');
    expect(formatCellText(1234567.89, 'number')).toBe('1,234,567.89');
    expect(formatCellText(0, 'number')).toBe('0');
  });

  it('formats string numbers', () => {
    expect(formatCellText('42', 'number')).toBe('42');
    expect(formatCellText('1000', 'number')).toBe('1,000');
  });

  // ── Status formatting ──
  it('passes through status values as strings', () => {
    expect(formatCellText('active', 'status')).toBe('active');
    expect(formatCellText('cancelled', 'status')).toBe('cancelled');
  });

  // ── Text formatting ──
  it('passes through text values', () => {
    expect(formatCellText('Hello world', 'text')).toBe('Hello world');
    expect(formatCellText(42, 'text')).toBe('42');
  });

  // ── Object values ──
  it('JSON-stringifies objects', () => {
    expect(formatCellText({ a: 1 }, 'text')).toBe('{"a":1}');
    expect(formatCellText([1, 2], 'number')).toBe('[1,2]');
  });
});

// ═══════════════════════════════════════════════════════════════
// getStatusColor
// ═══════════════════════════════════════════════════════════════

describe('getStatusColor', () => {
  it('returns green for positive statuses', () => {
    expect(getStatusColor('active')).toContain('emerald');
    expect(getStatusColor('Completed')).toContain('emerald');
    expect(getStatusColor('PAID')).toContain('emerald');
  });

  it('returns amber for pending statuses', () => {
    expect(getStatusColor('pending')).toContain('amber');
    expect(getStatusColor('Processing')).toContain('amber');
    expect(getStatusColor('in_progress')).toContain('amber');
  });

  it('returns red for negative statuses', () => {
    expect(getStatusColor('cancelled')).toContain('red');
    expect(getStatusColor('voided')).toContain('red');
    expect(getStatusColor('Failed')).toContain('red');
    expect(getStatusColor('no_show')).toContain('red');
  });

  it('returns muted for neutral/unknown statuses', () => {
    expect(getStatusColor('closed')).toContain('muted');
    expect(getStatusColor('draft')).toContain('muted');
    expect(getStatusColor('something_unknown')).toContain('muted');
  });

  it('handles case-insensitive and trimmed values', () => {
    expect(getStatusColor('  ACTIVE  ')).toContain('emerald');
    expect(getStatusColor('Pending')).toContain('amber');
  });
});

// ═══════════════════════════════════════════════════════════════
// isDeltaColumn
// ═══════════════════════════════════════════════════════════════

describe('isDeltaColumn', () => {
  it('detects delta/change columns', () => {
    expect(isDeltaColumn('revenue_change')).toBe(true);
    expect(isDeltaColumn('growth')).toBe(true);
    expect(isDeltaColumn('yoy_diff')).toBe(true);
    expect(isDeltaColumn('variance')).toBe(true);
    expect(isDeltaColumn('vs_last_week')).toBe(true);
    expect(isDeltaColumn('mom')).toBe(true);
  });

  it('does not flag non-delta columns', () => {
    expect(isDeltaColumn('total_revenue')).toBe(false);
    expect(isDeltaColumn('name')).toBe(false);
    expect(isDeltaColumn('order_status')).toBe(false);
    expect(isDeltaColumn('price')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// rowsToCsv
// ═══════════════════════════════════════════════════════════════

describe('rowsToCsv', () => {
  it('converts rows to CSV format', () => {
    const rows = [
      { name: 'Alice', revenue: 1000 },
      { name: 'Bob', revenue: 2000 },
    ];
    const csv = rowsToCsv(rows);
    expect(csv).toBe('"name","revenue"\nAlice,1000\nBob,2000');
  });

  it('handles empty rows', () => {
    expect(rowsToCsv([])).toBe('');
  });

  it('escapes commas and quotes in values', () => {
    const rows = [{ desc: 'Hello, "world"', val: 42 }];
    const csv = rowsToCsv(rows);
    expect(csv).toContain('"Hello, ""world"""');
  });

  it('handles null values as empty', () => {
    const rows = [{ name: null, val: 1 }];
    const csv = rowsToCsv(rows);
    expect(csv).toBe('"name","val"\n,1');
  });
});

// ═══════════════════════════════════════════════════════════════
// buildDrillPrompt
// ═══════════════════════════════════════════════════════════════

describe('buildDrillPrompt', () => {
  it('builds a drill-down prompt with context', () => {
    const row = { server_name: 'Alice', total_revenue: 5000 };
    const prompt = buildDrillPrompt('total_revenue', '$5,000.00', row);
    expect(prompt).toContain('total revenue');
    expect(prompt).toContain('$5,000.00');
    expect(prompt).toContain('Alice');
  });

  it('works without identifier columns', () => {
    const row = { x: 1, y: 2 };
    const prompt = buildDrillPrompt('x', '1', row);
    expect(prompt).toContain('x = "1"');
    expect(prompt).not.toContain('for');
  });
});
