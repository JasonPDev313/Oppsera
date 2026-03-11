/**
 * KDS location resolution utilities.
 *
 * KDS stations and routing rules are configured at the site level.
 * When a user is logged into a venue (locationType='venue'), we need to
 * resolve to the parent site for all KDS operations.
 */

interface LocationLike {
  id: string;
  name?: string;
  locationType?: string | null;
  parentLocationId?: string | null;
}

/**
 * Given a location (possibly a venue), returns the site-level location ID
 * that KDS stations are configured under.
 */
export function resolveKdsLocationId(
  location: LocationLike | undefined,
): string | undefined {
  if (!location) return undefined;
  if (location.locationType === 'venue' && location.parentLocationId) {
    return location.parentLocationId;
  }
  return location.id;
}

/**
 * Given a location (possibly a venue), returns the site-level location name.
 */
export function resolveKdsLocationName(
  location: LocationLike | undefined,
  allLocations?: LocationLike[],
): string | undefined {
  if (!location) return undefined;
  if (location.locationType === 'venue' && location.parentLocationId && allLocations) {
    return allLocations.find((l) => l.id === location.parentLocationId)?.name ?? location.name;
  }
  return location.name;
}

/**
 * Filters a locations array to only site-level locations (excludes venues).
 * Used for KDS location pickers — stations are per-site, not per-venue.
 */
export function getSiteLocations(locations: LocationLike[] | undefined): LocationLike[] {
  if (!locations) return [];
  return locations.filter((l) => !l.locationType || l.locationType === 'site');
}

/**
 * Resolves an initial KDS location ID, handling the case where the default
 * location might be a venue.
 */
export function resolveInitialKdsLocationId(
  candidateId: string | undefined,
  locations: LocationLike[] | undefined,
): string {
  if (!candidateId || !locations) return '';
  const loc = locations.find((l) => l.id === candidateId);
  if (loc?.locationType === 'venue' && loc.parentLocationId) {
    return loc.parentLocationId;
  }
  return candidateId;
}
