import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import {
  pmsGroups,
  pmsGroupRoomBlocks,
  pmsReservations,
  pmsRoomBlocks,
  pmsRoomTypes,
  pmsProperties,
  pmsRatePlans,
  pmsFolios,
  pmsGuests,
} from '@oppsera/db';
import type { PickUpGroupRoomInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';

export async function pickUpGroupRoom(ctx: RequestContext, input: PickUpGroupRoomInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Validate group exists and belongs to tenant
    const [group] = await tx
      .select()
      .from(pmsGroups)
      .where(
        and(
          eq(pmsGroups.id, input.groupId),
          eq(pmsGroups.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!group) {
      throw new NotFoundError('Group', input.groupId);
    }

    if (group.status === 'cancelled') {
      throw new ValidationError('Cannot pick up rooms from a cancelled group', [
        { field: 'groupId', message: 'Group is cancelled' },
      ]);
    }

    const ri = input.reservationInput;
    const propertyId = group.propertyId;

    // 2. Validate property
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', propertyId);

    // 3. Validate room type
    const [roomType] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.id, ri.roomTypeId),
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
          eq(pmsRoomTypes.propertyId, propertyId),
        ),
      )
      .limit(1);
    if (!roomType) throw new NotFoundError('RoomType', ri.roomTypeId);

    // 4. Check block availability for this room type and date range
    const blockCheckRows = await tx.execute(sql`
      SELECT COALESCE(SUM(rooms_blocked), 0) AS blocked,
             COALESCE(SUM(rooms_picked_up), 0) AS picked_up
      FROM pms_group_room_blocks
      WHERE tenant_id = ${ctx.tenantId}
        AND group_id = ${input.groupId}
        AND room_type_id = ${ri.roomTypeId}
        AND block_date >= ${ri.checkInDate}
        AND block_date < ${ri.checkOutDate}
        AND released = false
    `);
    const blockArr = Array.from(blockCheckRows as Iterable<Record<string, unknown>>);
    const blocked = Number(blockArr[0]?.blocked ?? 0);
    const pickedUp = Number(blockArr[0]?.picked_up ?? 0);

    if (blocked <= 0 || pickedUp >= blocked) {
      throw new ValidationError('No available rooms in block for the requested dates and room type', [
        { field: 'reservationInput.roomTypeId', message: `Blocked: ${blocked}, Already picked up: ${pickedUp}` },
      ]);
    }

    // 5. Resolve nightly rate: group negotiated rate > rate plan > input override
    let nightlyRateCents = ri.nightlyRateCents ?? 0;
    const ratePlanId = ri.ratePlanId ?? group.ratePlanId;

    if (ri.nightlyRateCents == null && group.negotiatedRateCents != null) {
      nightlyRateCents = group.negotiatedRateCents;
    } else if (ri.nightlyRateCents == null && ratePlanId) {
      const [ratePlan] = await tx
        .select()
        .from(pmsRatePlans)
        .where(
          and(
            eq(pmsRatePlans.id, ratePlanId),
            eq(pmsRatePlans.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (ratePlan?.defaultNightlyRateCents != null) {
        nightlyRateCents = ratePlan.defaultNightlyRateCents;
      }
    }

    // 6. Check room availability if room assigned
    if (ri.roomId) {
      await checkRoomNotOutOfOrder(tx, ctx.tenantId, ri.roomId);
      await assertRoomAvailable(tx, ctx.tenantId, ri.roomId, ri.checkInDate, ri.checkOutDate);
    }

    // 7. Resolve guest
    let resolvedGuestId: string | null = null;
    if (ri.guestId) {
      const [existingGuest] = await tx
        .select({ id: pmsGuests.id })
        .from(pmsGuests)
        .where(and(eq(pmsGuests.id, ri.guestId), eq(pmsGuests.tenantId, ctx.tenantId)))
        .limit(1);

      if (existingGuest) {
        resolvedGuestId = existingGuest.id;
      } else {
        const [linkedGuest] = await tx
          .select({ id: pmsGuests.id })
          .from(pmsGuests)
          .where(
            and(
              eq(pmsGuests.customerId, ri.guestId),
              eq(pmsGuests.tenantId, ctx.tenantId),
              eq(pmsGuests.propertyId, propertyId),
            ),
          )
          .limit(1);

        if (linkedGuest) {
          resolvedGuestId = linkedGuest.id;
        } else {
          const [newGuest] = await tx
            .insert(pmsGuests)
            .values({
              tenantId: ctx.tenantId,
              propertyId,
              customerId: ri.guestId,
              firstName: ri.primaryGuestJson.firstName,
              lastName: ri.primaryGuestJson.lastName,
              email: ri.primaryGuestJson.email ?? null,
              phone: ri.primaryGuestJson.phone ?? null,
              createdBy: ctx.user.id,
            })
            .returning();
          resolvedGuestId = newGuest!.id;
        }
      }
    }

    // 8. Calculate totals
    const checkIn = new Date(ri.checkInDate);
    const checkOut = new Date(ri.checkOutDate);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const subtotalCents = nights * nightlyRateCents;
    const taxRatePct = Number(property.taxRatePct ?? 0);
    const taxCents = Math.round(subtotalCents * taxRatePct / 100);
    const totalCents = subtotalCents + taxCents;

    const reservationId = generateUlid();
    const status = ri.status ?? 'CONFIRMED';

    // 9. Insert reservation with groupId
    const [reservation] = await tx
      .insert(pmsReservations)
      .values({
        id: reservationId,
        tenantId: ctx.tenantId,
        propertyId,
        guestId: resolvedGuestId,
        primaryGuestJson: ri.primaryGuestJson,
        roomId: ri.roomId ?? null,
        roomTypeId: ri.roomTypeId,
        ratePlanId: ratePlanId ?? null,
        groupId: input.groupId,
        checkInDate: ri.checkInDate,
        checkOutDate: ri.checkOutDate,
        adults: ri.adults ?? 1,
        children: ri.children ?? 0,
        nightlyRateCents,
        nights,
        subtotalCents,
        taxCents,
        feeCents: 0,
        totalCents,
        status,
        sourceType: ri.sourceType ?? 'DIRECT',
        internalNotes: ri.internalNotes ?? null,
        guestNotes: ri.guestNotes ?? null,
        restrictionOverride: ri.restrictionOverride ?? false,
        version: 1,
        createdBy: ctx.user.id,
      })
      .returning();

    // 10. Create room block if room assigned
    if (ri.roomId) {
      await tx.insert(pmsRoomBlocks).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        propertyId,
        roomId: ri.roomId,
        reservationId,
        startDate: ri.checkInDate,
        endDate: ri.checkOutDate,
        blockType: 'RESERVATION',
        isActive: true,
      });
    }

    // 11. Auto-create OPEN folio
    const folioId = generateUlid();
    await tx.insert(pmsFolios).values({
      id: folioId,
      tenantId: ctx.tenantId,
      propertyId,
      reservationId,
      status: 'OPEN',
      subtotalCents: 0,
      taxCents: 0,
      feeCents: 0,
      totalCents: 0,
    });

    // 12. Increment rooms_picked_up on the matching group room blocks
    await tx.execute(sql`
      UPDATE pms_group_room_blocks
      SET rooms_picked_up = rooms_picked_up + 1, updated_at = now()
      WHERE tenant_id = ${ctx.tenantId}
        AND group_id = ${input.groupId}
        AND room_type_id = ${ri.roomTypeId}
        AND block_date >= ${ri.checkInDate}
        AND block_date < ${ri.checkOutDate}
        AND released = false
    `);

    // 13. Update group's roomsPickedUp
    await tx
      .update(pmsGroups)
      .set({
        roomsPickedUp: (group.roomsPickedUp ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(pmsGroups.id, input.groupId), eq(pmsGroups.tenantId, ctx.tenantId)));

    // 14. Audit + event
    await pmsAuditLogEntry(tx, ctx, propertyId, 'group', input.groupId, 'room_picked_up', {
      reservationId,
      roomTypeId: ri.roomTypeId,
      checkInDate: ri.checkInDate,
      checkOutDate: ri.checkOutDate,
    });

    const guestName = `${ri.primaryGuestJson.firstName} ${ri.primaryGuestJson.lastName}`;
    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_ROOM_PICKED_UP, {
      groupId: input.groupId,
      reservationId,
      propertyId,
      guestName,
      roomTypeId: ri.roomTypeId,
      checkInDate: ri.checkInDate,
      checkOutDate: ri.checkOutDate,
      nightlyRateCents,
      totalCents,
    });

    return { result: { ...reservation!, folioId }, events: [event] };
  });

  await auditLog(ctx, 'pms.group.room_picked_up', 'pms_group', input.groupId);

  return result;
}
