/**
 * Shared helpers for parsing API route query parameters.
 * Ensures consistent limit capping, cursor parsing, and type coercion
 * across all GET endpoints.
 */

/**
 * Parse a `limit` query parameter with a maximum cap.
 * Returns a safe integer between 1 and `max`, defaulting to `defaultValue`.
 */
export function parseLimit(
  value: string | null,
  max = 100,
  defaultValue = 50,
): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, max);
}

/**
 * Parse a `cursor` query parameter.
 * Returns the string value or undefined if absent/empty.
 */
export function parseCursor(value: string | null): string | undefined {
  return value || undefined;
}

/**
 * Parse a boolean query parameter.
 * Returns true only if value is exactly 'true', false if 'false',
 * or undefined if absent.
 */
export function parseBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Parse an ISO date string query parameter.
 * Returns the string if it looks like a valid date, or undefined.
 */
export function parseDate(value: string | null): string | undefined {
  if (!value) return undefined;
  // Accept ISO 8601 date or datetime formats
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  return undefined;
}

/**
 * Parse a numeric query parameter.
 * Returns the number or undefined if absent/invalid.
 */
export function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return isNaN(n) ? undefined : n;
}
