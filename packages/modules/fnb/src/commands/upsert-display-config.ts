import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbStationDisplayConfigs, fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpsertDisplayConfigInput } from '../validation';
import { StationNotFoundError } from '../errors';

export async function upsertDisplayConfig(
  ctx: RequestContext,
  input: UpsertDisplayConfigInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'upsertDisplayConfig',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate station exists
    const [station] = await (tx as any)
      .select()
      .from(fnbKitchenStations)
      .where(and(
        eq(fnbKitchenStations.id, input.stationId),
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!station) throw new StationNotFoundError(input.stationId);

    // Check for existing config for this station
    const [existing] = await (tx as any)
      .select()
      .from(fnbStationDisplayConfigs)
      .where(and(
        eq(fnbStationDisplayConfigs.stationId, input.stationId),
        eq(fnbStationDisplayConfigs.tenantId, ctx.tenantId),
      ))
      .limit(1);

    let saved;
    if (existing) {
      [saved] = await (tx as any)
        .update(fnbStationDisplayConfigs)
        .set({
          displayDeviceId: input.displayDeviceId ?? existing.displayDeviceId,
          displayMode: input.displayMode ?? existing.displayMode,
          columnsPerRow: input.columnsPerRow ?? existing.columnsPerRow,
          sortBy: input.sortBy ?? existing.sortBy,
          showModifiers: input.showModifiers ?? existing.showModifiers,
          showSeatNumbers: input.showSeatNumbers ?? existing.showSeatNumbers,
          showCourseHeaders: input.showCourseHeaders ?? existing.showCourseHeaders,
          autoScrollEnabled: input.autoScrollEnabled ?? existing.autoScrollEnabled,
          soundAlertEnabled: input.soundAlertEnabled ?? existing.soundAlertEnabled,
          updatedAt: new Date(),
        })
        .where(eq(fnbStationDisplayConfigs.id, existing.id))
        .returning();
    } else {
      [saved] = await (tx as any)
        .insert(fnbStationDisplayConfigs)
        .values({
          tenantId: ctx.tenantId,
          stationId: input.stationId,
          displayDeviceId: input.displayDeviceId ?? null,
          displayMode: input.displayMode ?? 'standard',
          columnsPerRow: input.columnsPerRow ?? 4,
          sortBy: input.sortBy ?? 'time',
          showModifiers: input.showModifiers ?? true,
          showSeatNumbers: input.showSeatNumbers ?? true,
          showCourseHeaders: input.showCourseHeaders ?? true,
          autoScrollEnabled: input.autoScrollEnabled ?? false,
          soundAlertEnabled: input.soundAlertEnabled ?? true,
        })
        .returning();
    }

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertDisplayConfig', saved);

    return { result: saved!, events: [] };
  });

  await auditLog(ctx, 'fnb.display_config.upserted', 'fnb_station_display_configs', result.id);
  return result;
}
