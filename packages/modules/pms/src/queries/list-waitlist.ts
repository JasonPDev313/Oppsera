import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant, pmsWaitlist, pmsRoomTypes, pmsGuests } from '@oppsera/db';

function encodeCursor(priority: number, createdAt: Date, id: string): string {
  return `${priority}|${createdAt.toISOString()}|${id}`;
}

function decodeCursor(cursor: string): { priority: number; createdAt: string; id: string } | null {
  const parts = cursor.split('|');
  if (parts.length === 3) {
    const priority = Number(parts[0]);
    if (!isNaN(priority)) {
      return { priority, createdAt: parts[1]!, id: parts[2]! };
    }
  }
  return null;
}

export interface ListWaitlistInput {
  tenantId: string;
  propertyId: string;
  status?: string;
  guestId?: string;
  roomTypeId?: string;
  cursor?: string;
  limit?: number;
}

export interface WaitlistRow {
  id: string;
  guestId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  adults: number;
  children: number;
  checkInDate: string | null;
  checkOutDate: string | null;
  flexibility: string;
  status: string;
  offeredReservationId: string | null;
  offeredRateCents: number | null;
  offerExpiresAt: Date | null;
  priority: number;
  loyaltyTier: string | null;
  hasDeposit: boolean;
  rateLockCents: number | null;
  notes: string | null;
  source: string;
  guestToken: string | null;
  notifiedAt: Date | null;
  bookedAt: Date | null;
  createdAt: Date;
}

export interface ListWaitlistResult {
  items: WaitlistRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listWaitlist(input: ListWaitlistInput): Promise<ListWaitlistResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(pmsWaitlist.tenantId, input.tenantId),
      eq(pmsWaitlist.propertyId, input.propertyId),
    ];

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor);
      if (decoded) {
        conditions.push(
          sql`(${pmsWaitlist.priority}, ${pmsWaitlist.createdAt}, ${pmsWaitlist.id}) < (${decoded.priority}, ${decoded.createdAt}::timestamptz, ${decoded.id})`,
        );
      }
    }

    if (input.status) conditions.push(eq(pmsWaitlist.status, input.status));
    if (input.guestId) conditions.push(eq(pmsWaitlist.guestId, input.guestId));
    if (input.roomTypeId) conditions.push(eq(pmsWaitlist.roomTypeId, input.roomTypeId));

    const rows = await tx
      .select({
        id: pmsWaitlist.id,
        guestId: pmsWaitlist.guestId,
        guestName: sql<string | null>`COALESCE(${pmsWaitlist.guestName}, CONCAT(${pmsGuests.firstName}, ' ', ${pmsGuests.lastName}))`,
        guestEmail: sql<string | null>`COALESCE(${pmsWaitlist.guestEmail}, ${pmsGuests.email})`,
        guestPhone: sql<string | null>`COALESCE(${pmsWaitlist.guestPhone}, ${pmsGuests.phone})`,
        roomTypeId: pmsWaitlist.roomTypeId,
        roomTypeName: pmsRoomTypes.name,
        adults: pmsWaitlist.adults,
        children: pmsWaitlist.children,
        checkInDate: pmsWaitlist.checkInDate,
        checkOutDate: pmsWaitlist.checkOutDate,
        flexibility: pmsWaitlist.flexibility,
        status: pmsWaitlist.status,
        offeredReservationId: pmsWaitlist.offeredReservationId,
        offeredRateCents: pmsWaitlist.offeredRateCents,
        offerExpiresAt: pmsWaitlist.offerExpiresAt,
        priority: pmsWaitlist.priority,
        loyaltyTier: pmsWaitlist.loyaltyTier,
        hasDeposit: pmsWaitlist.hasDeposit,
        rateLockCents: pmsWaitlist.rateLockCents,
        notes: pmsWaitlist.notes,
        source: pmsWaitlist.source,
        guestToken: pmsWaitlist.guestToken,
        notifiedAt: pmsWaitlist.notifiedAt,
        bookedAt: pmsWaitlist.bookedAt,
        createdAt: pmsWaitlist.createdAt,
      })
      .from(pmsWaitlist)
      .leftJoin(pmsGuests, eq(pmsWaitlist.guestId, pmsGuests.id))
      .leftJoin(pmsRoomTypes, eq(pmsWaitlist.roomTypeId, pmsRoomTypes.id))
      .where(and(...conditions))
      .orderBy(desc(pmsWaitlist.priority), desc(pmsWaitlist.createdAt), desc(pmsWaitlist.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    if (sliced.length === 0) {
      return { items: [], cursor: null, hasMore: false };
    }

    const items: WaitlistRow[] = sliced.map((r) => ({
      id: r.id,
      guestId: r.guestId ?? null,
      guestName: r.guestName ?? null,
      guestEmail: r.guestEmail ?? null,
      guestPhone: r.guestPhone ?? null,
      roomTypeId: r.roomTypeId ?? null,
      roomTypeName: r.roomTypeName ?? null,
      adults: r.adults,
      children: r.children,
      checkInDate: r.checkInDate ?? null,
      checkOutDate: r.checkOutDate ?? null,
      flexibility: r.flexibility,
      status: r.status,
      offeredReservationId: r.offeredReservationId ?? null,
      offeredRateCents: r.offeredRateCents ?? null,
      offerExpiresAt: r.offerExpiresAt ?? null,
      priority: r.priority,
      loyaltyTier: r.loyaltyTier ?? null,
      hasDeposit: r.hasDeposit,
      rateLockCents: r.rateLockCents ?? null,
      notes: r.notes ?? null,
      source: r.source,
      guestToken: r.guestToken ?? null,
      notifiedAt: r.notifiedAt ?? null,
      bookedAt: r.bookedAt ?? null,
      createdAt: r.createdAt,
    }));

    const last = sliced[sliced.length - 1]!;
    return {
      items,
      cursor: hasMore ? encodeCursor(last.priority, last.createdAt, last.id) : null,
      hasMore,
    };
  });
}
