/**
 * PMS Background Job: Housekeeping Auto-Dirty
 *
 * Ensures rooms with yesterday's CHECKED_OUT reservations are marked VACANT_DIRTY.
 * Catches edge cases where check-out didn't properly update room status.
 *
 * Schedule: Daily early morning
 */
import { withTenant, sql } from '@oppsera/db';

export interface AutoDirtyResult {
  propertyId: string;
  roomsChecked: number;
  roomsMarkedDirty: number;
}

export async function runHousekeepingAutoDirty(
  tenantId: string,
  propertyId: string,
  today: string,
): Promise<AutoDirtyResult> {
  const result: AutoDirtyResult = {
    propertyId,
    roomsChecked: 0,
    roomsMarkedDirty: 0,
  };

  // Yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split('T')[0]!;

  await withTenant(tenantId, async (tx) => {
    // Find rooms that had check-outs yesterday but are not VACANT_DIRTY
    const rooms = await tx.execute(sql`
      SELECT DISTINCT rm.id AS room_id, rm.status
      FROM pms_rooms rm
      JOIN pms_reservations res ON res.room_id = rm.id AND res.tenant_id = rm.tenant_id
      WHERE rm.tenant_id = ${tenantId}
        AND rm.property_id = ${propertyId}
        AND rm.is_active = true
        AND res.status = 'CHECKED_OUT'
        AND res.check_out_date = ${yesterdayDate}
        AND rm.status NOT IN ('VACANT_DIRTY', 'OUT_OF_ORDER')
        AND rm.status != 'OCCUPIED'
    `);

    const rows = Array.from(rooms as Iterable<any>);
    result.roomsChecked = rows.length;

    for (const room of rows) {
      await tx.execute(sql`
        UPDATE pms_rooms
        SET status = 'VACANT_DIRTY', updated_at = NOW()
        WHERE id = ${room.room_id}
          AND tenant_id = ${tenantId}
      `);

      // Log the status change
      const { generateUlid } = await import('@oppsera/shared');
      await tx.execute(sql`
        INSERT INTO pms_room_status_log (id, tenant_id, property_id, room_id, from_status, to_status, business_date, changed_by)
        VALUES (${generateUlid()}, ${tenantId}, ${propertyId}, ${room.room_id}, ${room.status}, 'VACANT_DIRTY', ${today}, 'system')
      `);

      result.roomsMarkedDirty += 1;
    }
  });

  console.log(
    `[pms.housekeeping-auto-dirty] property=${propertyId} today=${today} checked=${result.roomsChecked} marked=${result.roomsMarkedDirty}`,
  );

  return result;
}
