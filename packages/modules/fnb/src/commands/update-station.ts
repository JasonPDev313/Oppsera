import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateStationInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { StationNotFoundError } from '../errors';

export async function updateStation(
  ctx: RequestContext,
  stationId: string,
  input: UpdateStationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateStation',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const conditions = [
      eq(fnbKitchenStations.id, stationId),
      eq(fnbKitchenStations.tenantId, ctx.tenantId),
    ];
    // Scope to location if available (prevents cross-location updates)
    if (ctx.locationId) {
      conditions.push(eq(fnbKitchenStations.locationId, ctx.locationId));
    }
    const [station] = await tx
      .select()
      .from(fnbKitchenStations)
      .where(and(...conditions))
      .limit(1);
    if (!station) throw new StationNotFoundError(stationId);

    // Validate thresholds (use incoming value or existing DB value)
    const warn = input.warningThresholdSeconds ?? station.warningThresholdSeconds;
    const crit = input.criticalThresholdSeconds ?? station.criticalThresholdSeconds;
    if (crit <= warn) {
      throw new Error('Critical threshold must be greater than warning threshold.');
    }

    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};

    if (input.displayName !== undefined) { setFields.displayName = input.displayName; changes.displayName = input.displayName; }
    if (input.stationType !== undefined) { setFields.stationType = input.stationType; changes.stationType = input.stationType; }
    if (input.color !== undefined) { setFields.color = input.color; changes.color = input.color; }
    if (input.sortOrder !== undefined) { setFields.sortOrder = input.sortOrder; changes.sortOrder = input.sortOrder; }
    if (input.fallbackStationId !== undefined) { setFields.fallbackStationId = input.fallbackStationId; changes.fallbackStationId = input.fallbackStationId; }
    if (input.backupPrinterId !== undefined) { setFields.backupPrinterId = input.backupPrinterId; changes.backupPrinterId = input.backupPrinterId; }
    if (input.terminalLocationId !== undefined) { setFields.terminalLocationId = input.terminalLocationId; changes.terminalLocationId = input.terminalLocationId; }
    if (input.warningThresholdSeconds !== undefined) { setFields.warningThresholdSeconds = input.warningThresholdSeconds; changes.warningThresholdSeconds = input.warningThresholdSeconds; }
    if (input.criticalThresholdSeconds !== undefined) { setFields.criticalThresholdSeconds = input.criticalThresholdSeconds; changes.criticalThresholdSeconds = input.criticalThresholdSeconds; }
    if (input.isActive !== undefined) { setFields.isActive = input.isActive; changes.isActive = input.isActive; }
    if (input.autoBumpOnAllReady !== undefined) { setFields.autoBumpOnAllReady = input.autoBumpOnAllReady; changes.autoBumpOnAllReady = input.autoBumpOnAllReady; }

    const [updated] = await tx
      .update(fnbKitchenStations)
      .set(setFields)
      .where(eq(fnbKitchenStations.id, stationId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.STATION_UPDATED, {
      stationId,
      locationId: ctx.locationId,
      changes,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateStation', updated);

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.station.updated', 'fnb_kitchen_stations', stationId);
  return result;
}
