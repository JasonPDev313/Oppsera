import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateStationInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { DuplicateStationNameError } from '../errors';

export async function createStation(
  ctx: RequestContext,
  input: CreateStationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createStation',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Check for duplicate name at this location
    const [existing] = await (tx as any)
      .select()
      .from(fnbKitchenStations)
      .where(and(
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
        eq(fnbKitchenStations.locationId, ctx.locationId!),
        eq(fnbKitchenStations.name, input.name),
      ))
      .limit(1);
    if (existing) throw new DuplicateStationNameError(input.name);

    const [created] = await (tx as any)
      .insert(fnbKitchenStations)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        name: input.name,
        displayName: input.displayName,
        stationType: input.stationType ?? 'prep',
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
        fallbackStationId: input.fallbackStationId ?? null,
        backupPrinterId: input.backupPrinterId ?? null,
        terminalLocationId: input.terminalLocationId ?? null,
        warningThresholdSeconds: input.warningThresholdSeconds ?? 480,
        criticalThresholdSeconds: input.criticalThresholdSeconds ?? 720,
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.STATION_CREATED, {
      stationId: created!.id,
      locationId: ctx.locationId,
      name: input.name,
      stationType: input.stationType ?? 'prep',
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createStation', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.station.created', 'fnb_kitchen_stations', result.id);
  return result;
}
