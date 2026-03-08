import { eq, and, sql } from 'drizzle-orm';
import { withTenant, pmsWaitlist, pmsRoomTypes, pmsProperties } from '@oppsera/db';

export interface WaitlistPublicStatus {
  id: string;
  guestName: string | null;
  roomTypeName: string | null;
  adults: number;
  children: number;
  checkInDate: string | null;
  checkOutDate: string | null;
  flexibility: string;
  status: string;
  offeredRateCents: number | null;
  offerExpiresAt: string | null;
  position: number;
  propertyName: string;
  createdAt: string;
}

/**
 * Look up a waitlist entry by guest token — used by the public webapp.
 * Returns the entry status + queue position.
 */
export async function getWaitlistByToken(input: {
  tenantId: string;
  token: string;
}): Promise<WaitlistPublicStatus | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [entry] = await tx
      .select({
        id: pmsWaitlist.id,
        guestName: pmsWaitlist.guestName,
        roomTypeId: pmsWaitlist.roomTypeId,
        roomTypeName: pmsRoomTypes.name,
        adults: pmsWaitlist.adults,
        children: pmsWaitlist.children,
        checkInDate: pmsWaitlist.checkInDate,
        checkOutDate: pmsWaitlist.checkOutDate,
        flexibility: pmsWaitlist.flexibility,
        status: pmsWaitlist.status,
        offeredRateCents: pmsWaitlist.offeredRateCents,
        offerExpiresAt: pmsWaitlist.offerExpiresAt,
        priority: pmsWaitlist.priority,
        propertyId: pmsWaitlist.propertyId,
        propertyName: pmsProperties.name,
        createdAt: pmsWaitlist.createdAt,
      })
      .from(pmsWaitlist)
      .leftJoin(pmsRoomTypes, eq(pmsWaitlist.roomTypeId, pmsRoomTypes.id))
      .leftJoin(pmsProperties, eq(pmsWaitlist.propertyId, pmsProperties.id))
      .where(
        and(
          eq(pmsWaitlist.tenantId, input.tenantId),
          eq(pmsWaitlist.guestToken, input.token),
        ),
      )
      .limit(1);

    if (!entry) return null;

    // Calculate position: count waiting entries with higher priority or earlier createdAt
    let position = 1;
    if (entry.status === 'waiting') {
      const [posResult] = await tx
        .select({
          cnt: sql<number>`count(*)::int`,
        })
        .from(pmsWaitlist)
        .where(
          and(
            eq(pmsWaitlist.tenantId, input.tenantId),
            eq(pmsWaitlist.propertyId, entry.propertyId),
            eq(pmsWaitlist.status, 'waiting'),
            sql`(${pmsWaitlist.priority} > ${entry.priority}
              OR (${pmsWaitlist.priority} = ${entry.priority} AND ${pmsWaitlist.createdAt} < ${entry.createdAt})
              OR (${pmsWaitlist.priority} = ${entry.priority} AND ${pmsWaitlist.createdAt} = ${entry.createdAt} AND ${pmsWaitlist.id} < ${entry.id}))`,
          ),
        );

      position = (posResult?.cnt ?? 0) + 1;
    }

    return {
      id: entry.id,
      guestName: entry.guestName ?? null,
      roomTypeName: entry.roomTypeName ?? null,
      adults: entry.adults,
      children: entry.children,
      checkInDate: entry.checkInDate ?? null,
      checkOutDate: entry.checkOutDate ?? null,
      flexibility: entry.flexibility,
      status: entry.status,
      offeredRateCents: entry.offeredRateCents ?? null,
      offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
      position,
      propertyName: entry.propertyName ?? 'Property',
      createdAt: entry.createdAt.toISOString(),
    };
  });
}
