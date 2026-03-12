/**
 * Normalize businessDate to YYYY-MM-DD string.
 *
 * Drizzle `date()` without `{ mode: 'string' }` returns a JS Date at runtime
 * despite TypeScript inferring `string`. This helper safely converts both
 * Date objects and strings to a consistent YYYY-MM-DD format, preventing
 * postgres.js serialization issues inside publishWithOutbox transactions.
 */
export function normalizeBusinessDate(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string' && value.length >= 10) {
    return value.slice(0, 10);
  }
  return String(value ?? '');
}
