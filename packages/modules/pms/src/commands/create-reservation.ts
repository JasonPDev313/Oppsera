import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import {
  pmsReservations,
  pmsRoomBlocks,
  pmsRoomTypes,
  pmsProperties,
  pmsRatePlans,
  pmsFolios,
  pmsGuests,
} from '@oppsera/db';
import type { CreateReservationInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';
import { checkRestrictions } from '../queries/check-restrictions';

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
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createReservation');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

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

    // 4. Validate rate plan and resolve nightly rate
    let nightlyRateCents = input.nightlyRateCents ?? 0;

    if (input.ratePlanId) {
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

      // If no nightly rate override provided, resolve from rate plan prices then fallback to default
      if (input.nightlyRateCents == null) {
        // Try date-specific price first
        const priceRows = await tx.execute(sql`
          SELECT nightly_base_cents
          FROM pms_rate_plan_prices
          WHERE tenant_id = ${ctx.tenantId}
            AND rate_plan_id = ${input.ratePlanId}
            AND room_type_id = ${input.roomTypeId}
            AND start_date <= ${input.checkInDate}
            AND end_date > ${input.checkInDate}
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const priceArr = Array.from(priceRows as Iterable<Record<string, unknown>>);
        if (priceArr.length > 0) {
          nightlyRateCents = Number(priceArr[0]!.nightly_base_cents);
        } else if (ratePlan.defaultNightlyRateCents != null) {
          // Fallback to rate plan's default rate
          nightlyRateCents = ratePlan.defaultNightlyRateCents;
        }
      }
    }

    if (nightlyRateCents <= 0 && input.nightlyRateCents == null) {
      throw new ValidationError('Unable to determine nightly rate', [
        { field: 'nightlyRateCents', message: 'No rate plan price found for this room type and dates. Please specify a nightly rate.' },
      ]);
    }

    // 5. Resolve guest — input.guestId may be a pms_guest ID or a customer ID
    let resolvedGuestId: string | null = null;
    if (input.guestId) {
      // First check if it's already a pms_guest
      const [existingGuest] = await tx
        .select({ id: pmsGuests.id })
        .from(pmsGuests)
        .where(and(eq(pmsGuests.id, input.guestId), eq(pmsGuests.tenantId, ctx.tenantId)))
        .limit(1);

      if (existingGuest) {
        resolvedGuestId = existingGuest.id;
      } else {
        // Treat as a customer ID — find or create a pms_guest linked to this customer
        const [linkedGuest] = await tx
          .select({ id: pmsGuests.id })
          .from(pmsGuests)
          .where(
            and(
              eq(pmsGuests.customerId, input.guestId),
              eq(pmsGuests.tenantId, ctx.tenantId),
              eq(pmsGuests.propertyId, input.propertyId),
            ),
          )
          .limit(1);

        if (linkedGuest) {
          resolvedGuestId = linkedGuest.id;
        } else {
          // Auto-create pms_guest from primaryGuestJson + customerId
          const [newGuest] = await tx
            .insert(pmsGuests)
            .values({
              tenantId: ctx.tenantId,
              propertyId: input.propertyId,
              customerId: input.guestId,
              firstName: input.primaryGuestJson.firstName,
              lastName: input.primaryGuestJson.lastName,
              email: input.primaryGuestJson.email ?? null,
              phone: input.primaryGuestJson.phone ?? null,
              createdBy: ctx.user.id,
            })
            .returning();
          resolvedGuestId = newGuest!.id;
        }
      }
    }

    // 6. Check rate restrictions (skip if restrictionOverride)
    if (!input.restrictionOverride) {
      const restrictionCheck = await checkRestrictions({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId ?? null,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
      });
      if (!restrictionCheck.allowed) {
        throw new ValidationError('Rate restrictions violated', restrictionCheck.violations.map((v) => ({
          field: 'restrictions',
          message: v,
        })));
      }
    }

    // 7. Check room availability if room is assigned
    if (input.roomId) {
      await checkRoomNotOutOfOrder(tx, ctx.tenantId, input.roomId);
      await assertRoomAvailable(tx, ctx.tenantId, input.roomId, input.checkInDate, input.checkOutDate);
    }

    // 8. Calculate totals
    const checkIn = new Date(input.checkInDate);
    const checkOut = new Date(input.checkOutDate);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const subtotalCents = nights * nightlyRateCents;
    const taxRatePct = Number(property.taxRatePct ?? 0);
    const taxCents = Math.round(subtotalCents * taxRatePct / 100);
    const feeCents = 0;
    const totalCents = subtotalCents + taxCents + feeCents;

    const reservationId = generateUlid();
    const status = input.status ?? 'CONFIRMED';

    // 9. Insert reservation
    const [reservation] = await tx
      .insert(pmsReservations)
      .values({
        id: reservationId,
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        guestId: resolvedGuestId,
        primaryGuestJson: input.primaryGuestJson,
        roomId: input.roomId ?? null,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId ?? null,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        adults,
        children,
        nightlyRateCents,
        nights,
        subtotalCents,
        taxCents,
        feeCents,
        totalCents,
        status,
        sourceType: input.sourceType ?? 'DIRECT',
        internalNotes: input.internalNotes ?? null,
        guestNotes: input.guestNotes ?? null,
        restrictionOverride: input.restrictionOverride ?? false,
        version: 1,
        createdBy: ctx.user.id,
      })
      .returning();

    // 10. Create room block if room assigned
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

    // 11. Auto-create OPEN folio
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

    // 12. Audit log
    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'reservation', reservationId, 'created', {
      status,
      roomId: input.roomId ?? null,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      totalCents,
    });

    // 13. Build event
    const guestName = `${input.primaryGuestJson.firstName} ${input.primaryGuestJson.lastName}`;
    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_CREATED, {
      reservationId,
      propertyId: input.propertyId,
      guestId: resolvedGuestId,
      guestName,
      roomId: input.roomId ?? null,
      roomTypeId: input.roomTypeId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      status,
      sourceType: input.sourceType ?? 'DIRECT',
      nightlyRateCents,
      totalCents,
      version: 1,
    });

    const resultPayload = { ...reservation!, folioId };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createReservation', resultPayload);
    return { result: resultPayload, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.created', 'pms_reservation', result.id);
  return result;
}
