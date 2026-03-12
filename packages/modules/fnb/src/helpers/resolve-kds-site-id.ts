/**
 * @deprecated KDS stations are per-location (not per-site). This helper
 * previously promoted venue IDs to their parent site. It now returns
 * the locationId unchanged. Remove all callers and delete this file.
 */
export async function resolveKdsSiteId(
  _tenantId: string,
  locationId: string,
): Promise<string> {
  return locationId;
}
