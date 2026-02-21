import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTables, fnbTableLiveStatus, floorPlanRooms } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateTableInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { RoomNotFoundError, DuplicateTableNumberError } from '../errors';

export async function createTable(
  ctx: RequestContext,
  input: CreateTableInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createTable',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate room exists
    const [room] = await (tx as any)
      .select()
      .from(floorPlanRooms)
      .where(and(
        eq(floorPlanRooms.id, input.roomId),
        eq(floorPlanRooms.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!room) throw new RoomNotFoundError(input.roomId);

    // Check for duplicate table number in this room
    const [existing] = await (tx as any)
      .select()
      .from(fnbTables)
      .where(and(
        eq(fnbTables.tenantId, ctx.tenantId),
        eq(fnbTables.roomId, input.roomId),
        eq(fnbTables.tableNumber, input.tableNumber),
      ))
      .limit(1);
    if (existing) throw new DuplicateTableNumberError(input.tableNumber, input.roomId);

    const [created] = await (tx as any)
      .insert(fnbTables)
      .values({
        tenantId: ctx.tenantId,
        locationId: room.locationId,
        roomId: input.roomId,
        floorPlanObjectId: input.floorPlanObjectId ?? null,
        tableNumber: input.tableNumber,
        displayLabel: input.displayLabel,
        capacityMin: input.capacityMin ?? 1,
        capacityMax: input.capacityMax,
        tableType: input.tableType ?? 'standard',
        shape: input.shape ?? 'square',
        positionX: String(input.positionX ?? 0),
        positionY: String(input.positionY ?? 0),
        width: String(input.width ?? 0),
        height: String(input.height ?? 0),
        rotation: String(input.rotation ?? 0),
        isCombinable: input.isCombinable ?? true,
        sectionId: input.sectionId ?? null,
        sortOrder: input.sortOrder ?? 0,
        createdBy: ctx.user.id,
      })
      .returning();

    // Create live status row
    await (tx as any)
      .insert(fnbTableLiveStatus)
      .values({
        tenantId: ctx.tenantId,
        tableId: created!.id,
        status: 'available',
      });

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABLE_CREATED, {
      tableId: created!.id,
      roomId: input.roomId,
      locationId: room.locationId,
      tableNumber: input.tableNumber,
      displayLabel: input.displayLabel,
      capacityMax: input.capacityMax,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createTable', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.table.created', 'fnb_tables', result.id);
  return result;
}
