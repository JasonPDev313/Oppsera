import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GuestReservationSummary {
  id: string;
  confirmationNumber: string | null;
  roomTypeName: string | null;
  roomNumber: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  nightlyRateCents: number;
  totalCents: number;
}

export interface GuestDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  customerId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  addressJson: Record<string, unknown> | null;
  preferencesJson: Record<string, unknown> | null;
  notes: string | null;
  totalStays: number;
  lastStayDate: string | null;
  isVip: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  recentReservations: GuestReservationSummary[];
}

/**
 * Get a guest profile with their last N reservations (stay history).
 * Default history limit is 10 reservations, ordered by check-in date descending.
 */
export async function getGuest(
  tenantId: string,
  guestId: string,
  historyLimit: number = 10,
): Promise<GuestDetail> {
  return withTenant(tenantId, async (tx) => {
    // Fetch guest profile
    const guestRows = await tx.execute(sql`
      SELECT
        id, tenant_id, property_id, customer_id,
        first_name, last_name, email, phone,
        address_json, preferences_json, notes,
        total_stays, last_stay_date, is_vip,
        created_at, updated_at, created_by
      FROM pms_guests
      WHERE id = ${guestId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const guestArr = Array.from(guestRows as Iterable<Record<string, unknown>>);
    if (guestArr.length === 0) {
      throw new NotFoundError('Guest', guestId);
    }

    const guest = guestArr[0]!;

    // Fetch recent reservations with room type and room info
    const capped = Math.min(historyLimit, 50);
    const resRows = await tx.execute(sql`
      SELECT
        rv.id,
        rv.confirmation_number,
        rt.name AS room_type_name,
        rm.room_number,
        rv.check_in_date,
        rv.check_out_date,
        rv.status,
        rv.nightly_rate_cents,
        rv.total_cents
      FROM pms_reservations rv
      LEFT JOIN pms_room_types rt ON rt.id = rv.room_type_id AND rt.tenant_id = rv.tenant_id
      LEFT JOIN pms_rooms rm ON rm.id = rv.room_id AND rm.tenant_id = rv.tenant_id
      WHERE rv.guest_id = ${guestId}
        AND rv.tenant_id = ${tenantId}
      ORDER BY rv.check_in_date DESC, rv.id DESC
      LIMIT ${capped}
    `);

    const resArr = Array.from(resRows as Iterable<Record<string, unknown>>);

    return {
      id: String(guest.id),
      tenantId: String(guest.tenant_id),
      propertyId: String(guest.property_id),
      customerId: guest.customer_id ? String(guest.customer_id) : null,
      firstName: String(guest.first_name),
      lastName: String(guest.last_name),
      email: guest.email ? String(guest.email) : null,
      phone: guest.phone ? String(guest.phone) : null,
      addressJson: guest.address_json as Record<string, unknown> | null,
      preferencesJson: guest.preferences_json as Record<string, unknown> | null,
      notes: guest.notes ? String(guest.notes) : null,
      totalStays: Number(guest.total_stays),
      lastStayDate: guest.last_stay_date ? String(guest.last_stay_date) : null,
      isVip: Boolean(guest.is_vip),
      createdAt: String(guest.created_at),
      updatedAt: String(guest.updated_at),
      createdBy: guest.created_by ? String(guest.created_by) : null,
      recentReservations: resArr.map((r) => ({
        id: String(r.id),
        confirmationNumber: r.confirmation_number ? String(r.confirmation_number) : null,
        roomTypeName: r.room_type_name ? String(r.room_type_name) : null,
        roomNumber: r.room_number ? String(r.room_number) : null,
        checkInDate: String(r.check_in_date),
        checkOutDate: String(r.check_out_date),
        status: String(r.status),
        nightlyRateCents: Number(r.nightly_rate_cents),
        totalCents: Number(r.total_cents),
      })),
    };
  });
}
