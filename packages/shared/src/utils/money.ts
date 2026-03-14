function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * Add two or more dollar amounts together, rounding via integer cent arithmetic
 * to avoid floating-point drift.
 *
 * NOTE: Inputs and output are in **dollars** (e.g., 9.99), NOT cents.
 * Use this only in the catalog/GL/AP/AR layer. For order totals (cents),
 * perform integer addition directly.
 */
function addMoney(...amounts: number[]): number {
  const totalCents = amounts.reduce((sum, amt) => sum + toCents(amt), 0);
  return toDollars(totalCents);
}

function subtractMoney(a: number, b: number): number {
  return toDollars(toCents(a) - toCents(b));
}

function multiplyMoney(amount: number, qty: number): number {
  return toDollars(Math.round(toCents(amount) * qty));
}

// ── Formatting ──────────────────────────────────────────────────

const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a dollar amount → "$12.50". Simple, no thousands separator. */
function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Format cents (integer) → "$12.34". Most common — POS, orders, F&B. */
function formatCents(cents: number): string {
  if (cents < 0) return `-$${(Math.abs(cents) / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format cents (integer) → "12.34" (no $ sign). Receipt engine line items. */
function formatCentsRaw(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Format a dollar amount → "$1,234.50" with locale thousands separator. */
function formatDollarsLocale(dollars: number): string {
  return usdFormat.format(dollars);
}

/** Format cents (integer) → "$1,234.50" with locale thousands separator. */
function formatCentsLocale(cents: number): string {
  return usdFormat.format(cents / 100);
}

/** Format a Drizzle NUMERIC string (dollars) → "$12.50". Returns "—" for null/undefined. */
function formatDollarString(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return `$${Number(value).toFixed(2)}`;
}

/** Format a large dollar amount compactly → "$1.2M", "$45K", "$123". */
function formatCompact(dollars: number): string {
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export {
  toCents,
  toDollars,
  addMoney,
  subtractMoney,
  multiplyMoney,
  formatMoney,
  formatCents,
  formatCentsRaw,
  formatDollarsLocale,
  formatCentsLocale,
  formatDollarString,
  formatCompact,
};
