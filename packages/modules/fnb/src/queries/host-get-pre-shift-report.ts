import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostGetPreShiftReportInput } from '../validation-host';

export interface PreShiftReservation {
  id: string;
  guestName: string;
  partySize: number;
  reservationTime: string;
  status: string;
  specialRequests: string | null;
  occasion: string | null;
  tags: string[];
  isVip: boolean;
  seatingPreference: string | null;
}

export interface PreShiftReport {
  reservations: PreShiftReservation[];
  vipCount: number;
  largePartyCount: number;
  specialOccasionCount: number;
  totalCovers: number;
  totalReservations: number;
}

/**
 * Pre-shift briefing report for a given date + meal period.
 * Lists all reservations with VIP flags, large party indicators,
 * and special occasion highlights. Useful for pre-service team huddles.
 *
 * - VIP: is_vip = true OR 'vip' in tags array
 * - Large party: party_size >= 6
 * - Special occasion: occasion IS NOT NULL
 */
export async function hostGetPreShiftReport(
  input: HostGetPreShiftReportInput,
): Promise<PreShiftReport> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.guest_name,
        r.party_size,
        r.reservation_time,
        r.status,
        r.special_requests,
        r.occasion,
        r.tags,
        r.is_vip,
        r.seating_preference
      FROM fnb_reservations r
      WHERE r.tenant_id = ${input.tenantId}
        AND r.location_id = ${input.locationId}
        AND r.reservation_date = ${input.date}
        AND r.meal_period = ${input.mealPeriod}
        AND r.status NOT IN ('canceled')
      ORDER BY r.reservation_time ASC
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const reservations = allRows.map(mapPreShiftReservation);

    let vipCount = 0;
    let largePartyCount = 0;
    let specialOccasionCount = 0;
    let totalCovers = 0;

    for (const res of reservations) {
      totalCovers += res.partySize;
      if (res.isVip) vipCount++;
      if (res.partySize >= 6) largePartyCount++;
      if (res.occasion) specialOccasionCount++;
    }

    return {
      reservations,
      vipCount,
      largePartyCount,
      specialOccasionCount,
      totalCovers,
      totalReservations: reservations.length,
    };
  });
}

function mapPreShiftReservation(row: Record<string, unknown>): PreShiftReservation {
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  const isVipFlag = Boolean(row.is_vip);
  const isVipFromTags = tags.some((t) => t.toLowerCase() === 'vip');

  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    partySize: Number(row.party_size),
    reservationTime: String(row.reservation_time),
    status: String(row.status),
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    tags,
    isVip: isVipFlag || isVipFromTags,
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
  };
}
