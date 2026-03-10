import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface RoomingListReservation {
  reservationId: string;
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  nightlyRateCents: number;
  totalCents: number;
  folioId: string | null;
  folioNumber: number | null;
  folioBalance: number;
  internalNotes: string | null;
  guestNotes: string | null;
}

export interface GetGroupRoomingListResult {
  groupId: string;
  groupName: string;
  propertyId: string;
  reservations: RoomingListReservation[];
  summary: {
    total: number;
    confirmed: number;
    checkedIn: number;
    checkedOut: number;
    cancelled: number;
  };
}

export async function getGroupRoomingList(
  tenantId: string,
  groupId: string,
): Promise<GetGroupRoomingListResult> {
  return withTenant(tenantId, async (tx) => {
    const groupRows = await tx.execute(sql`
      SELECT id, name, property_id FROM pms_groups
      WHERE id = ${groupId} AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const groupArr = Array.from(groupRows as Iterable<Record<string, unknown>>);
    if (groupArr.length === 0) throw new NotFoundError('Group', groupId);
    const group = groupArr[0]!;

    const rows = await tx.execute(sql`
      SELECT
        r.id AS reservation_id,
        r.primary_guest_json,
        r.room_id,
        rm.number AS room_number,
        r.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        r.check_in_date,
        r.check_out_date,
        r.nights,
        r.adults,
        r.children,
        r.status,
        r.nightly_rate_cents,
        r.total_cents,
        r.internal_notes,
        r.guest_notes,
        f.id AS folio_id,
        f.folio_number,
        COALESCE(f.total_cents, 0) - COALESCE(
          (SELECT COALESCE(SUM(amount_cents), 0) FROM pms_folio_entries
           WHERE folio_id = f.id AND tenant_id = ${tenantId} AND entry_type = 'PAYMENT'), 0
        ) AS folio_balance
      FROM pms_reservations r
      INNER JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = r.tenant_id
      LEFT JOIN pms_rooms rm ON rm.id = r.room_id AND rm.tenant_id = r.tenant_id
      LEFT JOIN pms_folios f ON f.reservation_id = r.id AND f.tenant_id = r.tenant_id
      WHERE r.tenant_id = ${tenantId}
        AND r.group_id = ${groupId}
      ORDER BY r.check_in_date ASC, r.primary_guest_json->>'lastName' ASC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    const summary = { total: 0, confirmed: 0, checkedIn: 0, checkedOut: 0, cancelled: 0 };

    const reservations: RoomingListReservation[] = arr.map((r) => {
      const guestJson = (r.primary_guest_json ?? {}) as Record<string, unknown>;
      const status = String(r.status);
      summary.total++;
      if (status === 'CONFIRMED' || status === 'HOLD') summary.confirmed++;
      else if (status === 'CHECKED_IN') summary.checkedIn++;
      else if (status === 'CHECKED_OUT') summary.checkedOut++;
      else if (status === 'CANCELLED') summary.cancelled++;

      return {
        reservationId: String(r.reservation_id),
        guestFirstName: String(guestJson.firstName ?? ''),
        guestLastName: String(guestJson.lastName ?? ''),
        guestEmail: guestJson.email ? String(guestJson.email) : null,
        guestPhone: guestJson.phone ? String(guestJson.phone) : null,
        roomId: r.room_id ? String(r.room_id) : null,
        roomNumber: r.room_number ? String(r.room_number) : null,
        roomTypeId: String(r.room_type_id),
        roomTypeCode: String(r.room_type_code),
        roomTypeName: String(r.room_type_name),
        checkInDate: String(r.check_in_date),
        checkOutDate: String(r.check_out_date),
        nights: Number(r.nights),
        adults: Number(r.adults),
        children: Number(r.children),
        status,
        nightlyRateCents: Number(r.nightly_rate_cents),
        totalCents: Number(r.total_cents),
        folioId: r.folio_id ? String(r.folio_id) : null,
        folioNumber: r.folio_number != null ? Number(r.folio_number) : null,
        folioBalance: Number(r.folio_balance ?? 0),
        internalNotes: r.internal_notes ? String(r.internal_notes) : null,
        guestNotes: r.guest_notes ? String(r.guest_notes) : null,
      };
    });

    return {
      groupId,
      groupName: String(group.name),
      propertyId: String(group.property_id),
      reservations,
      summary,
    };
  });
}
