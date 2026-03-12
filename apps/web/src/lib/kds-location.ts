/**
 * KDS location resolution utilities.
 *
 * INVARIANT: Every location owns its own KDS stations independently.
 * There is NO venue→site promotion. Bar 1, Restaurant 1, and the parent
 * site each manage their own stations, routing rules, and tickets.
 *
 * If you are tempted to add logic that resolves a venue to its parent
 * site — don't. That was a bug we fixed. Each location_id is used as-is.
 */

interface LocationLike {
  id: string;
  name?: string;
}

/**
 * Returns the location ID to use for KDS operations.
 * Always returns the location's own ID — no promotion.
 */
export function resolveKdsLocationId(
  location: LocationLike | undefined,
): string | undefined {
  if (!location) return undefined;
  return location.id;
}

/**
 * Returns the location name for KDS display.
 */
export function resolveKdsLocationName(
  location: LocationLike | undefined,
): string | undefined {
  if (!location) return undefined;
  return location.name;
}

/**
 * Returns all locations available for KDS configuration.
 * Every location can have its own KDS stations.
 */
export function getKdsLocations(locations: LocationLike[] | undefined): LocationLike[] {
  if (!locations) return [];
  return locations;
}

/**
 * Returns the candidate location ID directly.
 * Every location owns its own stations — no resolution needed.
 */
export function resolveInitialKdsLocationId(
  candidateId: string | undefined,
): string {
  return candidateId || '';
}
