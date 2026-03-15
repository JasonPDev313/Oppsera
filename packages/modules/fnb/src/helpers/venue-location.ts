import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';

export function assertSingleVenueLocation(
  locationIds: Array<string | null | undefined>,
  entityLabel = 'tables',
): string {
  const uniqueLocationIds = [...new Set(locationIds.filter((locationId): locationId is string => Boolean(locationId)))];

  if (uniqueLocationIds.length === 0) {
    throw new AppError(
      'LOCATION_REQUIRED',
      `Unable to resolve a venue location from the selected ${entityLabel}`,
      400,
    );
  }

  if (uniqueLocationIds.length > 1) {
    throw new AppError(
      'CROSS_VENUE_SELECTION',
      `All selected ${entityLabel} must belong to the same venue`,
      409,
    );
  }

  return uniqueLocationIds[0]!;
}

export function withEffectiveLocationId(
  ctx: RequestContext,
  locationId: string,
): RequestContext {
  if (ctx.locationId === locationId) {
    return ctx;
  }

  return { ...ctx, locationId };
}
