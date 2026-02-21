/**
 * Build a URL query string from a filter object.
 * Skips undefined/null/empty-string values. Booleans are converted to 'true'.
 * Returns the query string WITH leading '?' if non-empty, or '' if empty.
 */
export function buildQueryString<T extends object>(
  filters: T,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      if (value) params.set(key, 'true');
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
