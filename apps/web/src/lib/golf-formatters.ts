/**
 * Golf-specific formatting utilities.
 *
 * IMPORTANT: Golf read models store monetary values as DOLLARS (NUMERIC 19,4),
 * NOT cents. formatGolfMoney() does NOT divide by 100.
 * See CLAUDE.md §74.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const INT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/** Format basis points (0-10000) as a percentage string. E.g., 8532 → "85.3%" */
export function formatBasisPoints(bps: number | null | undefined): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(1)}%`;
}

/** Format a dollar amount (NOT cents) as USD currency. E.g., 1234.56 → "$1,234.56" */
export function formatGolfMoney(dollars: number | null | undefined): string {
  if (dollars == null) return '—';
  return USD.format(dollars);
}

/** Format minutes as a duration string. E.g., 255 → "4h 15m", 45 → "45m" */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/** Format a number with commas (integer). E.g., 1234 → "1,234" */
export function formatRoundCount(count: number | null | undefined): string {
  if (count == null) return '—';
  return INT.format(count);
}

/** Compare two values and return a delta description */
export function formatComparisonDelta(
  current: number,
  previous: number,
): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0) {
    if (current === 0) return { text: '0%', direction: 'flat' };
    return { text: '+100%', direction: 'up' };
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 10) / 10;

  if (rounded === 0) return { text: '0%', direction: 'flat' };
  if (rounded > 0) return { text: `+${rounded}%`, direction: 'up' };
  return { text: `${rounded}%`, direction: 'down' };
}

/** Check a BPS value against warning/critical thresholds. */
export function bpsStatus(
  value: number | null | undefined,
  warnThreshold: number,
  criticalThreshold: number,
  mode: 'above' | 'below' = 'below',
): 'ok' | 'warning' | 'critical' {
  if (value == null) return 'ok';
  if (mode === 'below') {
    if (value <= criticalThreshold) return 'critical';
    if (value <= warnThreshold) return 'warning';
  } else {
    if (value >= criticalThreshold) return 'critical';
    if (value >= warnThreshold) return 'warning';
  }
  return 'ok';
}

/** Format a short date string for chart labels. E.g., "2026-03-15" → "Mar 15" */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
