import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenStations } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateStationInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { DuplicateStationNameError } from '../errors';
import { ValidationError } from '@oppsera/shared';

export async function createStation(
  ctx: RequestContext,
  input: CreateStationInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to create a station');
  }
  const warn = input.warningThresholdSeconds ?? 480;
  const crit = input.criticalThresholdSeconds ?? 720;
  if (crit <= warn) {
    throw new Error('Critical threshold must be greater than warning threshold.');
  }
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createStation',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Block station creation at a site that has venues — stations belong at the venue level
    const venueRows = await tx.execute(
      sql`SELECT 1 FROM locations
          WHERE parent_location_id = ${ctx.locationId} AND tenant_id = ${ctx.tenantId}
            AND location_type = 'venue'
          LIMIT 1`,
    );
    if (Array.from(venueRows as Iterable<unknown>).length > 0) {
      throw new ValidationError(
        'This site has venues — create KDS stations at the venue level instead',
        [{ field: 'locationId', message: 'Cannot create stations at a site that has venues' }],
      );
    }

    // Check for duplicate name at this location
    const [existing] = await tx
      .select()
      .from(fnbKitchenStations)
      .where(and(
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
        eq(fnbKitchenStations.locationId, ctx.locationId!),
        eq(fnbKitchenStations.name, input.name),
      ))
      .limit(1);
    if (existing) {
      if (existing.isActive) throw new DuplicateStationNameError(input.name);
      // Inactive station with this name — rename it to free the name for reuse
      await tx
        .update(fnbKitchenStations)
        .set({ name: `${existing.name}_archived_${Date.now()}` })
        .where(eq(fnbKitchenStations.id, existing.id));
    }

    const [created] = await tx
      .insert(fnbKitchenStations)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
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
        autoBumpOnAllReady: input.autoBumpOnAllReady ?? false,
        allowedOrderTypes: input.allowedOrderTypes ?? [],
        allowedChannels: input.allowedChannels ?? [],
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

  auditLogDeferred(ctx, 'fnb.station.created', 'fnb_kitchen_stations', result.id);
  return result;
}
