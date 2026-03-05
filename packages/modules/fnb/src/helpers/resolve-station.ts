import { resolveStationRouting } from '../services/kds-routing-engine';

/**
 * Resolves which KDS station an item should route to.
 *
 * @deprecated Use `resolveStationRouting()` from `../services/kds-routing-engine`
 * instead. This wrapper exists for backwards compatibility but lacks support for
 * routing conditions (order type, channel, time), category/modifier rules, and
 * station-level filtering (pause, allowed types/channels).
 */
export async function resolveStation(
  _tx: unknown,
  tenantId: string,
  locationId: string,
  item: { catalogItemId?: string | null; subDepartmentId?: string | null },
): Promise<string | null> {
  if (!item.catalogItemId) return null;

  const results = await resolveStationRouting(
    { tenantId, locationId },
    [{
      orderLineId: 'legacy',
      catalogItemId: item.catalogItemId,
      subDepartmentId: item.subDepartmentId ?? null,
    }],
  );

  return results[0]?.stationId ?? null;
}
