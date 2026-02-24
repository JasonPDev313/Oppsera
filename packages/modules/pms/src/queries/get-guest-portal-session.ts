import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@oppsera/db';
import {
  pmsGuestPortalSessions,
  pmsReservations,
  pmsRoomTypes,
  pmsProperties,
} from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export interface GuestPortalSessionDetail {
  id: string;
  reservationId: string;
  status: string;
  expiresAt: string;
  preCheckinCompleted: boolean;
  roomPreferenceJson: unknown;
  reservation: {
    id: string;
    confirmationNumber: string | null;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    children: number;
    status: string;
    roomTypeName: string | null;
    propertyName: string;
    propertyTimezone: string;
    guestId: string | null;
  };
}

/**
 * Get a guest portal session by token. Used for public (unauthenticated) portal access.
 * Does NOT require tenantId -- looks up by unique token.
 */
export async function getGuestPortalSessionByToken(
  token: string,
): Promise<GuestPortalSessionDetail> {
  // Token lookup is cross-tenant (unique index) -- use direct DB query without RLS
  const rows = await db.execute(
    sql`SELECT s.id, s.tenant_id, s.reservation_id, s.status, s.expires_at,
        s.pre_checkin_completed, s.room_preference_json,
        r.id as res_id, r.confirmation_number, r.check_in_date, r.check_out_date,
        r.adults, r.children, r.status as res_status, r.guest_id, r.room_type_id,
        rt.name as room_type_name, p.name as property_name, p.timezone as property_timezone
      FROM pms_guest_portal_sessions s
      JOIN pms_reservations r ON r.id = s.reservation_id AND r.tenant_id = s.tenant_id
      LEFT JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = s.tenant_id
      JOIN pms_properties p ON p.id = r.property_id AND p.tenant_id = s.tenant_id
      WHERE s.token = ${token}
      LIMIT 1`,
  );

  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  if (items.length === 0) {
    throw new AppError('SESSION_NOT_FOUND', 'Guest portal session not found', 404);
  }

  const row = items[0]!;

  // Check if expired
  const expiresAt = row.expires_at as Date;
  if (row.status === 'active' && new Date() > expiresAt) {
    throw new AppError('SESSION_EXPIRED', 'Guest portal session has expired', 410);
  }

  if (row.status !== 'active') {
    throw new AppError('SESSION_INACTIVE', `Guest portal session is ${row.status}`, 410);
  }

  return {
    id: row.id as string,
    reservationId: row.reservation_id as string,
    status: row.status as string,
    expiresAt: expiresAt.toISOString(),
    preCheckinCompleted: row.pre_checkin_completed as boolean,
    roomPreferenceJson: row.room_preference_json,
    reservation: {
      id: row.res_id as string,
      confirmationNumber: (row.confirmation_number as string) ?? null,
      checkInDate: String(row.check_in_date),
      checkOutDate: String(row.check_out_date),
      adults: Number(row.adults),
      children: Number(row.children),
      status: row.res_status as string,
      roomTypeName: (row.room_type_name as string) ?? null,
      propertyName: row.property_name as string,
      propertyTimezone: row.property_timezone as string,
      guestId: (row.guest_id as string) ?? null,
    },
  };
}

/**
 * Get portal session by ID, tenant-scoped (for authenticated admin lookups).
 */
export async function getGuestPortalSession(
  tenantId: string,
  sessionId: string,
): Promise<GuestPortalSessionDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [session] = await tx
      .select()
      .from(pmsGuestPortalSessions)
      .where(
        and(
          eq(pmsGuestPortalSessions.id, sessionId),
          eq(pmsGuestPortalSessions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!session) return null;

    const [reservation] = await tx
      .select()
      .from(pmsReservations)
      .where(eq(pmsReservations.id, session.reservationId))
      .limit(1);

    if (!reservation) return null;

    let roomTypeName: string | null = null;
    if (reservation.roomTypeId) {
      const [rt] = await tx
        .select({ name: pmsRoomTypes.name })
        .from(pmsRoomTypes)
        .where(eq(pmsRoomTypes.id, reservation.roomTypeId))
        .limit(1);
      roomTypeName = rt?.name ?? null;
    }

    const [property] = await tx
      .select({ name: pmsProperties.name, timezone: pmsProperties.timezone })
      .from(pmsProperties)
      .where(eq(pmsProperties.id, reservation.propertyId))
      .limit(1);

    return {
      id: session.id,
      reservationId: session.reservationId,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      preCheckinCompleted: session.preCheckinCompleted,
      roomPreferenceJson: session.roomPreferenceJson,
      reservation: {
        id: reservation.id,
        confirmationNumber: reservation.confirmationNumber ?? null,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        adults: reservation.adults,
        children: reservation.children,
        status: reservation.status,
        roomTypeName,
        propertyName: property?.name ?? '',
        propertyTimezone: property?.timezone ?? 'UTC',
        guestId: reservation.guestId ?? null,
      },
    };
  });
}
