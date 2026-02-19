// ── Date Preset Utility ─────────────────────────────────────────
// Pure functions for computing, detecting, and shifting date ranges.
// No React dependencies — fully unit-testable.

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'week_to_date'
  | 'month_to_date'
  | 'year_to_date'
  | 'last_week'
  | 'last_month'
  | 'last_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_365_days'
  | 'custom';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface DatePresetOption {
  value: DatePreset;
  label: string;
  group: 'relative' | 'to_date' | 'prior_period';
}

export const DEFAULT_PRESET: DatePreset = 'month_to_date';

export const DATE_PRESET_OPTIONS: DatePresetOption[] = [
  { value: 'today',         label: 'Today',            group: 'relative' },
  { value: 'yesterday',     label: 'Yesterday',        group: 'relative' },
  { value: 'last_7_days',   label: 'Last 7 Days',      group: 'relative' },
  { value: 'last_30_days',  label: 'Last 30 Days',     group: 'relative' },
  { value: 'last_365_days', label: 'The Last Year',     group: 'relative' },
  { value: 'week_to_date',  label: 'Week To Date',     group: 'to_date' },
  { value: 'month_to_date', label: 'Month To Date',    group: 'to_date' },
  { value: 'year_to_date',  label: 'Year To Date',     group: 'to_date' },
  { value: 'last_week',     label: 'Last Week',        group: 'prior_period' },
  { value: 'last_month',    label: 'Last Month',       group: 'prior_period' },
  { value: 'last_year',     label: 'Last Year',        group: 'prior_period' },
  { value: 'custom',        label: 'Custom',           group: 'relative' },
];

// ── Helpers ─────────────────────────────────────────────────────

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cloneDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = cloneDate(d);
  r.setDate(r.getDate() + n);
  return r;
}

function lastDayOfMonth(year: number, month: number): Date {
  // month is 0-based; day 0 of next month = last day of current month
  return new Date(year, month + 1, 0);
}

/** Monday = 1, Sunday = 7 (ISO weekday) */
function isoWeekday(d: Date): number {
  const day = d.getDay(); // 0=Sun .. 6=Sat
  return day === 0 ? 7 : day;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Core Functions ──────────────────────────────────────────────

/**
 * Compute the date range for a preset.
 * @param preset The date preset (must not be 'custom')
 * @param ref    Reference date for computation (default: now). Used for testing.
 */
export function computeDateRange(preset: DatePreset, ref?: Date): DateRange {
  const now = ref ? cloneDate(ref) : new Date();
  const today = formatDateISO(now);

  switch (preset) {
    case 'today':
      return { from: today, to: today };

    case 'yesterday': {
      const y = formatDateISO(addDays(now, -1));
      return { from: y, to: y };
    }

    case 'week_to_date': {
      // Monday of this week → today
      const wd = isoWeekday(now);
      const monday = addDays(now, -(wd - 1));
      return { from: formatDateISO(monday), to: today };
    }

    case 'month_to_date':
      return {
        from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        to: today,
      };

    case 'year_to_date':
      return { from: `${now.getFullYear()}-01-01`, to: today };

    case 'last_week': {
      // Previous Monday → previous Sunday
      const wd = isoWeekday(now);
      const thisMon = addDays(now, -(wd - 1));
      const prevMon = addDays(thisMon, -7);
      const prevSun = addDays(thisMon, -1);
      return { from: formatDateISO(prevMon), to: formatDateISO(prevSun) };
    }

    case 'last_month': {
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const first = new Date(prevYear, prevMonth, 1);
      const last = lastDayOfMonth(prevYear, prevMonth);
      return { from: formatDateISO(first), to: formatDateISO(last) };
    }

    case 'last_year': {
      const y = now.getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }

    case 'last_7_days':
      return { from: formatDateISO(addDays(now, -6)), to: today };

    case 'last_30_days':
      return { from: formatDateISO(addDays(now, -29)), to: today };

    case 'last_365_days':
      return { from: formatDateISO(addDays(now, -364)), to: today };

    case 'custom':
      throw new Error('Cannot compute date range for "custom" preset — supply explicit dates');

    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unknown preset: ${_exhaustive}`);
    }
  }
}

/**
 * Detect which preset matches the given date range.
 * Returns 'custom' if no preset matches exactly.
 */
export function detectPreset(from: string, to: string, ref?: Date): DatePreset {
  const presets: DatePreset[] = [
    'today', 'yesterday', 'week_to_date', 'month_to_date', 'year_to_date',
    'last_week', 'last_month', 'last_year',
    'last_7_days', 'last_30_days', 'last_365_days',
  ];

  for (const p of presets) {
    const range = computeDateRange(p, ref);
    if (range.from === from && range.to === to) return p;
  }

  return 'custom';
}

/**
 * Shift a date range forward or backward by a preset-appropriate interval.
 */
export function shiftDateRange(
  from: string,
  to: string,
  preset: DatePreset,
  direction: 'back' | 'forward',
): DateRange {
  const sign = direction === 'forward' ? 1 : -1;
  const fromDate = new Date(from + 'T00:00:00');
  const toDate = new Date(to + 'T00:00:00');

  let shiftDays: number;

  switch (preset) {
    case 'today':
    case 'yesterday':
      shiftDays = 1;
      break;

    case 'week_to_date':
    case 'last_week':
    case 'last_7_days':
      shiftDays = 7;
      break;

    case 'month_to_date':
    case 'last_month':
    case 'last_30_days': {
      // Shift by the actual range length for month-related presets
      shiftDays = diffDays(from, to) + 1;
      break;
    }

    case 'year_to_date':
    case 'last_year':
    case 'last_365_days':
      shiftDays = 365;
      break;

    case 'custom':
    default:
      // Shift by the exact range length
      shiftDays = diffDays(from, to) + 1;
      break;
  }

  const newFrom = addDays(fromDate, sign * shiftDays);
  const newTo = addDays(toDate, sign * shiftDays);

  return { from: formatDateISO(newFrom), to: formatDateISO(newTo) };
}
