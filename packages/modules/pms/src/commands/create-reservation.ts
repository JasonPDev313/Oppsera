import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import {
  pmsReservations,
  pmsRoomBlocks,
  pmsRoomTypes,
  pmsProperties,
  pmsRatePlans,
  pmsFolios,
} from '@oppsera/db';
import type { CreateReservationInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';

/**
 * Create a new reservation.
 * - Validates all references (property, room type, rate plan, room)
 * - Validates occupancy against room type limits
 * - Checks room availability if room assigned
 * - Calculates totals (nights * nightlyRate + tax)
 * - Creates room block if room assigned
 * - Auto-creates OPEN folio
 * - All within a single publishWithOutbox transaction
 */
export async function createReservation(ctx: RequestContext, input: CreateReservationInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Validate property exists
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    // 2. Validate room type exists and belongs to property
    const [roomType] = await tx
      .select()
      .from(pmsRoomTypes)
      .where(
        and(
          eq(pmsRoomTypes.id, input.roomTypeId),
          eq(pmsRoomTypes.tenantId, ctx.tenantId),
          eq(pmsRoomTypes.propertyId, input.propertyId),
        ),
      )
      .limit(1);
    if (!roomType) throw new NotFoundError('RoomType', input.roomTypeId);

    // 3. Validate occupancy
    const adults = input.adults ?? 1;
    const children = input.children ?? 0;
    if (adults + children > roomType.maxOccupancy) {
      throw new ValidationError('Occupancy exceeds room type capacity', [
        {
          field: 'adults',
          message: `Total guests (${adults + children}) exceeds max occupancy (${roomType.maxOccupancy})`,
        },
      ]);
    }

    // 4. Validate rate plan
    const [ratePlan] = await tx
      .select()
      .from(pmsRatePlans)
      .where(
        and(
          eq(pmsRatePlans.id, input.ratePlanId),
          eq(pmsRatePlans.tenantId, ctx.tenantId),
          eq(pmsRatePlans.propertyId, input.propertyId),
        ),
      )
      .limit(1);
    if (!ratePlan) throw new NotFoundError('RatePlan', input.ratePlanId);

    // 5. Check room availability if room is assigned
    if (input.roomId) {
      await checkRoomNotOutOfOrder(tx, ctx.tenantId, input.roomId);
      await assertRoomAvailable(tx, ctx.tenantId, input.roomId, input.checkInDate, input.checkOutDate);
    }

    // 6. Calculate totals
    const checkIn = new Date(input.checkInDate);
    const checkOut = new Date(input.checkOutDate);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const subtotalCents = nights * input.nightlyRateCents;
    const taxRatePct = Number(property.taxRatePct ?? 0);
    const taxCents = Math.round(subtotalCents * taxRatePct / 100);
    const feeCents = 0;
    const totalCents = subtotalCents + taxCents + feeCents;

    const reservationId = generateUlid();
    const status = input.status ?? 'CONFIRMED';

    // 7. Insert reservation
    const [reservation] = await tx
      .insert(pmsReservations)
      .values({
        id: reservationId,
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        guestId: input.guestId ?? null,
        primaryGuestJson: input.primaryGuestJson,
        roomId: input.roomId ?? null,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        adults,
        children,
        nightlyRateCents: input.nightlyRateCents,
        nights,
        subtotalCents,
        taxCents,
        feeCents,
        totalCents,
        status,
        sourceType: input.sourceType ?? 'DIRECT',
        internalNotes: input.internalNotes ?? null,
        guestNotes: input.guestNotes ?? null,
        version: 1,
        createdBy: ctx.user.id,
      })
      .returning();

    // 8. Create room block if room assigned
    if (input.roomId) {
      await tx.insert(pmsRoomBlocks).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        roomId: input.roomId,
        reservationId: reservationId,
        startDate: input.checkInDate,
        endDate: input.checkOutDate,
        blockType: 'RESERVATION',
        isActive: true,
      });
    }

    // 9. Auto-create OPEN folio
    const folioId = generateUlid();
    await tx.insert(pmsFolios).values({
      id: folioId,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      reservationId: reservationId,
      status: 'OPEN',
      subtotalCents: 0,
      taxCents: 0,
      feeCents: 0,
      totalCents: 0,
    });

    // 10. Audit log
    await pmsAuditLogEntry(tx, ctx, reservationId, 'reservation', reservationId, 'created', {
      status,
      roomId: input.roomId ?? null,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      totalCents,
    });

    // 11. Build event
    const guestName = `${input.primaryGuestJson.firstName} ${input.primaryGuestJson.lastName}`;
    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_CREATED, {
      reservationId,
      propertyId: input.propertyId,
      guestId: input.guestId ?? null,
      guestName,
      roomId: input.roomId ?? null,
      roomTypeId: input.roomTypeId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      status,
      sourceType: input.sourceType ?? 'DIRECT',
      nightlyRateCents: input.nightlyRateCents,
      totalCents,
      version: 1,
    });

    return { result: { ...reservation!, folioId }, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.created', 'pms_reservation', result.id);
  return result;
}
