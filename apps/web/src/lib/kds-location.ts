/**
 * KDS location resolution utilities (client-side).
 *
 * KDS stations are always tied to venues (e.g. "Resort", "Spa", "Saloon").
 * Sites (e.g. "Sunset Golf Resort") never have KDS stations directly.
 * No hierarchy fallback — the POS venue IS the KDS location.
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
