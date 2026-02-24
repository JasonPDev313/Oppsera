import { sql, eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  pmsReservations,
  pmsGuests,
  pmsRoomAssignmentPreferences,
} from '@oppsera/db';
import { rankRooms } from '../helpers/room-assignment-engine';
import type { ScoredRoom, AssignmentContext } from '../helpers/room-assignment-engine';

export interface RoomSuggestion {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  viewType: string | null;
  wing: string | null;
  score: number;
  reasons: string[];
}

export async function getRoomSuggestions(
  tenantId: string,
  reservationId: string,
): Promise<RoomSuggestion[]> {
  return withTenant(tenantId, async (tx) => {
    // ── Load reservation ─────────────────────────────────────────
    const [reservation] = await tx
      .select({
        id: pmsReservations.id,
        propertyId: pmsReservations.propertyId,
        roomTypeId: pmsReservations.roomTypeId,
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
        guestId: pmsReservations.guestId,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.id, reservationId),
          eq(pmsReservations.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!reservation) return [];

    // ── Load guest (if linked) ───────────────────────────────────
    let guestPreferences: Record<string, unknown> = {};
    let isVip = false;

    if (reservation.guestId) {
      const [guestRow] = await tx
        .select({
          isVip: pmsGuests.isVip,
          roomPreferencesJson: pmsGuests.roomPreferencesJson,
        })
        .from(pmsGuests)
        .where(
          and(
            eq(pmsGuests.id, reservation.guestId),
            eq(pmsGuests.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (guestRow) {
        isVip = guestRow.isVip;
        guestPreferences = (guestRow.roomPreferencesJson ?? {}) as Record<string, unknown>;
      }
    }

    // ── Load assignment preferences for the property ─────────────
    const preferenceRows = await tx
      .select()
      .from(pmsRoomAssignmentPreferences)
      .where(
        and(
          eq(pmsRoomAssignmentPreferences.tenantId, tenantId),
          eq(pmsRoomAssignmentPreferences.propertyId, reservation.propertyId),
          eq(pmsRoomAssignmentPreferences.isActive, true),
        ),
      );

    const weights = preferenceRows.map((r) => ({
      name: r.name,
      weight: r.weight,
    }));

    // ── Load available rooms (matching room type, not blocked) ───
    const availableRows = await tx.execute(sql`
      SELECT
        r.id,
        r.room_number,
        r.room_type_id,
        r.floor,
        r.view_type,
        r.wing,
        r.accessibility_json,
        r.connecting_room_ids,
        rt.name     AS room_type_name
      FROM pms_rooms r
      JOIN pms_room_types rt ON rt.id = r.room_type_id
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${reservation.propertyId}
        AND r.room_type_id = ${reservation.roomTypeId}
        AND r.is_active = true
        AND r.is_out_of_order = false
        AND NOT EXISTS (
          SELECT 1 FROM pms_room_blocks rb
          WHERE rb.room_id = r.id
            AND rb.is_active = true
            AND daterange(rb.start_date, rb.end_date, '[)')
                && daterange(${reservation.checkInDate}::date, ${reservation.checkOutDate}::date, '[)')
        )
      ORDER BY r.room_number
    `);

    const rows = Array.from(
      availableRows as Iterable<Record<string, unknown>>,
    );

    if (rows.length === 0) return [];

    // Map to ScoredRoom interface
    const scoredRooms: ScoredRoom[] = rows.map((row) => ({
      id: String(row.id),
      roomNumber: String(row.room_number),
      roomTypeId: String(row.room_type_id),
      floor: row.floor ? String(row.floor) : null,
      viewType: row.view_type ? String(row.view_type) : null,
      wing: row.wing ? String(row.wing) : null,
      accessibilityJson: (row.accessibility_json ?? {}) as Record<string, unknown>,
      connectingRoomIds: (row.connecting_room_ids ?? []) as string[],
    }));

    // Build a lookup for room type name
    const roomTypeNameMap = new Map<string, string>();
    for (const row of rows) {
      roomTypeNameMap.set(String(row.id), String(row.room_type_name));
    }

    const context: AssignmentContext = {
      guestPreferences,
      isVip,
      isRepeatGuest: false,
      roomTypeId: reservation.roomTypeId,
    };

    // ── Rank and return top 5 ────────────────────────────────────
    const ranked = rankRooms(scoredRooms, context, weights);

    return ranked.slice(0, 5).map((r) => ({
      roomId: r.roomId,
      roomNumber: scoredRooms.find((sr) => sr.id === r.roomId)?.roomNumber ?? '',
      roomTypeName: roomTypeNameMap.get(r.roomId) ?? '',
      floor: scoredRooms.find((sr) => sr.id === r.roomId)?.floor ?? null,
      viewType: scoredRooms.find((sr) => sr.id === r.roomId)?.viewType ?? null,
      wing: scoredRooms.find((sr) => sr.id === r.roomId)?.wing ?? null,
      score: r.score,
      reasons: r.reasons,
    }));
  });
}
