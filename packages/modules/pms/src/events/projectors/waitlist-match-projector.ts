/**
 * Waitlist Match Projector
 *
 * Listens for reservation cancellations and scores waiting-list entries
 * against the freed slot using the waitlist-matcher engine.
 *
 * If auto-offer is enabled in the property's waitlist config, the top
 * match automatically receives an offer. Otherwise, matches are logged
 * for front-desk staff to act on manually.
 */
import { eq, and, sql } from 'drizzle-orm';
import { withTenant, pmsWaitlist, pmsWaitlistConfig, pmsRoomTypes } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { matchWaitlistEntries } from '../../helpers/waitlist-matcher';
import type { CanceledReservation, WaitlistEntry } from '../../helpers/waitlist-matcher';

const CONSUMER_NAME = 'pms.waitlistMatchProjector';

/**
 * Handle a reservation cancellation event by scoring waitlist entries.
 */
export async function handleWaitlistMatch(envelope: EventEnvelope): Promise<void> {
  const { tenantId, data } = envelope;
  if (!tenantId || !data) return;

  const {
    reservationId,
    propertyId,
    roomId: _roomId,
    checkInDate,
    checkOutDate,
  } = data as {
    reservationId: string;
    propertyId: string;
    roomId: string | null;
    checkInDate: string;
    checkOutDate: string;
  };

  if (!propertyId || !checkInDate || !checkOutDate) return;

  await withTenant(tenantId, async (tx) => {
    // Load room type info from the reservation
    const [reservation] = await tx.execute(sql`
      SELECT room_type_id, nightly_rate_cents
      FROM pms_reservations
      WHERE id = ${reservationId} AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const resRow = reservation as { room_type_id: string; nightly_rate_cents: number } | undefined;
    if (!resRow) return;

    // Load room type max occupancy
    const [roomType] = await tx
      .select({ maxOccupancy: pmsRoomTypes.maxOccupancy })
      .from(pmsRoomTypes)
      .where(and(eq(pmsRoomTypes.id, resRow.room_type_id), eq(pmsRoomTypes.tenantId, tenantId)))
      .limit(1);

    const slot: CanceledReservation = {
      roomTypeId: resRow.room_type_id,
      checkInDate,
      checkOutDate,
      propertyId,
      maxOccupancy: roomType?.maxOccupancy ?? 2,
      nightlyRateCents: resRow.nightly_rate_cents,
    };

    // Load waiting entries for this property
    const waitingRows = await tx
      .select({
        id: pmsWaitlist.id,
        guestId: pmsWaitlist.guestId,
        guestName: pmsWaitlist.guestName,
        roomTypeId: pmsWaitlist.roomTypeId,
        adults: pmsWaitlist.adults,
        children: pmsWaitlist.children,
        checkInDate: pmsWaitlist.checkInDate,
        checkOutDate: pmsWaitlist.checkOutDate,
        flexibility: pmsWaitlist.flexibility,
        priority: pmsWaitlist.priority,
        loyaltyTier: pmsWaitlist.loyaltyTier,
        hasDeposit: pmsWaitlist.hasDeposit,
        createdAt: pmsWaitlist.createdAt,
      })
      .from(pmsWaitlist)
      .where(
        and(
          eq(pmsWaitlist.tenantId, tenantId),
          eq(pmsWaitlist.propertyId, propertyId),
          eq(pmsWaitlist.status, 'waiting'),
        ),
      );

    const entries: WaitlistEntry[] = Array.from(waitingRows as Iterable<typeof waitingRows[number]>);
    if (entries.length === 0) return;

    const matches = matchWaitlistEntries(entries, slot);
    if (matches.length === 0) return;

    console.log(
      `[${CONSUMER_NAME}] reservation=${reservationId} property=${propertyId} ` +
      `waiting=${entries.length} matches=${matches.length} topScore=${matches[0]!.score}`,
    );

    // Check if auto-offer is enabled
    const [config] = await tx
      .select({
        autoOfferEnabled: pmsWaitlistConfig.autoOfferEnabled,
        offerExpiryHours: pmsWaitlistConfig.offerExpiryHours,
        maxOffersPerSlot: pmsWaitlistConfig.maxOffersPerSlot,
      })
      .from(pmsWaitlistConfig)
      .where(and(eq(pmsWaitlistConfig.tenantId, tenantId), eq(pmsWaitlistConfig.propertyId, propertyId)))
      .limit(1);

    if (config?.autoOfferEnabled) {
      const maxOffers = config.maxOffersPerSlot ?? 1;
      const expiryHours = config.offerExpiryHours ?? 24;
      const topMatches = matches.slice(0, maxOffers);

      for (const match of topMatches) {
        const offerExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        await tx
          .update(pmsWaitlist)
          .set({
            status: 'offered',
            offeredReservationId: reservationId,
            offeredRateCents: slot.nightlyRateCents,
            offerExpiresAt,
            notifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(pmsWaitlist.tenantId, tenantId),
              eq(pmsWaitlist.id, match.entryId),
              eq(pmsWaitlist.status, 'waiting'), // guard against race
            ),
          );

        console.log(
          `[${CONSUMER_NAME}] auto-offered entry=${match.entryId} score=${match.score} expires=${offerExpiresAt.toISOString()}`,
        );
      }
    }
  });
}
