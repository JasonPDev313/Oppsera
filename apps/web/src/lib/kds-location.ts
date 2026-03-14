/**
 * KDS location resolution utilities (client-side).
 *
 * VENUE→SITE HIERARCHY:
 * When a venue has NO KDS stations, the server-side `resolveKdsLocationId`
 * falls back to the parent site. The stations API returns `effectiveLocationId`
 * when this happens. KDS pages should use effectiveLocationId for navigation
 * and ticket queries so they match where the server stores tickets.
 *
 * When a venue HAS its own stations, it uses them directly (per-venue KDS).
 *
 * These client-side helpers are used for the initial location resolution
 * before the stations API response is available.
 */

interface LocationLike {
  id: string;
  name?: string;
  locationType?: string | null;
  parentLocationId?: string | null;
}

/**
 * Returns the location ID to use for KDS operations.
 * Returns the location's own ID — server-side hierarchy resolution
 * happens via the stations API `effectiveLocationId` response.
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
 * Returns locations available for KDS configuration.
 * If a site has child venues, only the venues are shown — the site itself
 * is hidden because KDS stations should be configured per-venue.
 */
export function getKdsLocations(locations: LocationLike[] | undefined): LocationLike[] {
  if (!locations) return [];
  // Collect IDs of sites that have at least one venue child
  const sitesWithVenues = new Set<string>();
  for (const loc of locations) {
    if (loc.locationType === 'venue' && loc.parentLocationId) {
      sitesWithVenues.add(loc.parentLocationId);
    }
  }
  // Filter out parent sites that have venues
  if (sitesWithVenues.size === 0) return locations;
  return locations.filter((loc) => !sitesWithVenues.has(loc.id));
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
