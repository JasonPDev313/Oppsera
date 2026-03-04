// ── Shared formatting utilities for the semantic chat ──────────────
// Extracted from chat-message.tsx so they can be unit-tested.

// ── Column type inference ─────────────────────────────────────────

// Order matters: status → percent → currency → number → text.
// Percent MUST be checked before currency because columns like `margin_pct` contain both keywords.
const STATUS_PATTERNS = /(?:status|state|stage|phase)/i;
const PERCENT_PATTERNS = /(?:percent|pct|rate|ratio|growth|change|utilization|occupancy)/i;
const CURRENCY_PATTERNS = /(?:price|cost|amount|total|revenue|sales|spend|profit|margin|balance|fee|charge|tip|tax|discount|subtotal|payment|refund|gross|net)/i;
// Columns that contain currency keywords but are counts/quantities, not dollars.
const NOT_CURRENCY_PATTERNS = /(?:count|qty|quantity|num_|number_of|_id$|_ids$|items|units|hours|minutes|days)/i;

export type ColumnType = 'currency' | 'percent' | 'number' | 'status' | 'text';

export function inferColumnType(colName: string, values: unknown[]): ColumnType {
  if (STATUS_PATTERNS.test(colName)) return 'status';
  if (PERCENT_PATTERNS.test(colName)) return 'percent';
  if (CURRENCY_PATTERNS.test(colName) && !NOT_CURRENCY_PATTERNS.test(colName)) return 'currency';
  const nonNull = values.filter((v) => v != null && v !== '');
  if (nonNull.length > 0 && nonNull.every((v) => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''))) {
    return 'number';
  }
  return 'text';
}

// ── Cell value formatting (text-only, no JSX) ────────────────────
// Returns a string for testability. The component wraps nulls in JSX separately.

export function formatCellText(value: unknown, colType: ColumnType): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return JSON.stringify(value);

  const num = typeof value === 'number' ? value : Number(value);

  switch (colType) {
    case 'currency': {
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    case 'percent': {
      if (isNaN(num)) return String(value);
      const pct = Math.abs(num) <= 1 && num !== 0 ? num * 100 : num;
      return `${pct.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    case 'number': {
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    case 'status':
      return String(value);
    default:
      return String(value);
  }
}

// ── Status color mapping ─────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-500',
  completed: 'bg-emerald-500/15 text-emerald-500',
  complete: 'bg-emerald-500/15 text-emerald-500',
  paid: 'bg-emerald-500/15 text-emerald-500',
  confirmed: 'bg-emerald-500/15 text-emerald-500',
  open: 'bg-blue-500/15 text-blue-500',
  pending: 'bg-amber-500/15 text-amber-500',
  processing: 'bg-amber-500/15 text-amber-500',
  in_progress: 'bg-amber-500/15 text-amber-500',
  cancelled: 'bg-red-500/15 text-red-400',
  canceled: 'bg-red-500/15 text-red-400',
  voided: 'bg-red-500/15 text-red-400',
  void: 'bg-red-500/15 text-red-400',
  failed: 'bg-red-500/15 text-red-400',
  refunded: 'bg-red-500/15 text-red-400',
  closed: 'bg-muted text-muted-foreground',
  inactive: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  held: 'bg-violet-500/15 text-violet-400',
  checked_in: 'bg-blue-500/15 text-blue-500',
  checked_out: 'bg-emerald-500/15 text-emerald-500',
  no_show: 'bg-red-500/15 text-red-400',
};

export function getStatusColor(value: string): string {
  return STATUS_COLORS[value.toLowerCase().trim()] ?? 'bg-muted text-muted-foreground';
}

// ── Delta column detection ───────────────────────────────────────
// Columns whose values represent a change (positive = good, negative = bad).
const DELTA_PATTERNS = /(?:change|diff|delta|variance|growth|gain|loss|vs_|compared|yoy|mom|wow|qoq)/i;

export function isDeltaColumn(colName: string): boolean {
  return DELTA_PATTERNS.test(colName);
}

// ── CSV export ───────────────────────────────────────────────────

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const header = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
  const body = rows.map((row) =>
    cols.map((c) => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','),
  ).join('\n');
  return `${header}\n${body}`;
}

// ── Drill-down prompt builder ────────────────────────────────────

export function buildDrillPrompt(colName: string, cellValue: string, row: Record<string, unknown>): string {
  const label = colName.replace(/_/g, ' ');
  // Try to find the best "identifier" column (name, category, etc.) for context
  const idCols = Object.keys(row).filter((k) => /name|category|type|label|description|server|provider|item/i.test(k));
  const context = idCols.length > 0 ? ` for ${String(row[idCols[0]!])}` : '';
  return `Tell me more about ${label} = "${cellValue}"${context}. What's driving this?`;
}
