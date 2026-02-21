/**
 * Calendar read model projector.
 * Maintains rm_pms_calendar_segments — one row per reservation-room-day.
 * Used by the calendar week/day view queries.
 *
 * Performance: uses generate_series for batch INSERT instead of per-day loop.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';

const CONSUMER_NAME = 'pms.calendarProjector';

const ACTIVE_STATUSES = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];

function computeColorKey(status: string): string {
  switch (status) {
    case 'HOLD':
      return 'hold'; // amber
    case 'CONFIRMED':
      return 'confirmed'; // blue
    case 'CHECKED_IN':
      return 'in-house'; // green
    case 'CHECKED_OUT':
      return 'departed'; // gray
    case 'CANCELLED':
      return 'cancelled'; // gray-striped
    case 'NO_SHOW':
      return 'no-show'; // red-gray
    default:
      return 'unknown';
  }
}

/**
 * Rebuild calendar segments for a reservation.
 * Deletes all existing segments and batch-inserts for all days using generate_series.
 */
async function rebuildSegments(
  tx: any,
  tenantId: string,
  reservationId: string,
  propertyId: string,
  roomId: string | null,
  checkInDate: string,
  checkOutDate: string,
  status: string,
  guestName: string,
  sourceType: string,
): Promise<void> {
  // Delete existing segments for this reservation
  await tx.execute(sql`
    DELETE FROM rm_pms_calendar_segments
    WHERE tenant_id = ${tenantId} AND reservation_id = ${reservationId}
  `);

  // Only create segments for active reservations with room assigned
  if (!roomId || !ACTIVE_STATUSES.includes(status)) return;

  const colorKey = computeColorKey(status);

  // Pre-generate ULIDs for each day
  const ciDate = new Date(checkInDate);
  const coDate = new Date(checkOutDate);
  const nightCount = Math.round((coDate.getTime() - ciDate.getTime()) / (1000 * 60 * 60 * 24));
  if (nightCount <= 0) return;

  const ids: string[] = [];
  for (let i = 0; i < nightCount; i++) {
    ids.push(generateUlid());
  }

  // Batch insert all segments in a single statement using generate_series + UNNEST for IDs
  await tx.execute(sql`
    INSERT INTO rm_pms_calendar_segments (
      id, tenant_id, property_id, room_id, business_date,
      reservation_id, status, guest_name, check_in_date, check_out_date,
      source_type, color_key, created_at
    )
    SELECT
      unnest(${ids}::text[]),
      ${tenantId},
      ${propertyId},
      ${roomId},
      d::date,
      ${reservationId},
      ${status},
      ${guestName},
      ${checkInDate}::date,
      ${checkOutDate}::date,
      ${sourceType},
      ${colorKey},
      NOW()
    FROM generate_series(${checkInDate}::date, ${checkOutDate}::date - interval '1 day', '1 day') d
  `);
}

/**
 * Handle any reservation lifecycle event for calendar projection.
 */
export async function handleCalendarProjection(event: EventEnvelope): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const startTime = Date.now();

  await withTenant(event.tenantId, async (tx) => {
    // Atomic idempotency check
    const inserted = await tx.execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    const reservationId = String(data.reservationId ?? '');
    const propertyId = String(data.propertyId ?? '');

    // Determine the action based on event type
    const eventType = event.eventType;

    if (
      eventType.includes('cancelled') ||
      eventType.includes('no_show') ||
      eventType.includes('checked_out')
    ) {
      // Remove all segments for terminal statuses
      await tx.execute(sql`
        DELETE FROM rm_pms_calendar_segments
        WHERE tenant_id = ${event.tenantId} AND reservation_id = ${reservationId}
      `);
    } else if (eventType.includes('moved') || eventType.includes('created') || eventType.includes('checked_in')) {
      // Rebuild segments with new data
      const after = (data.after as Record<string, unknown>) ?? data;
      const roomId = String(after.roomId ?? data.roomId ?? '');
      const checkInDate = String(after.checkInDate ?? data.checkInDate ?? '');
      const checkOutDate = String(after.checkOutDate ?? data.checkOutDate ?? '');
      const status = String(data.status ?? 'CONFIRMED');
      const guestName = String(data.guestName ?? '');
      const sourceType = String(data.sourceType ?? 'DIRECT');

      if (roomId && checkInDate && checkOutDate) {
        await rebuildSegments(
          tx,
          event.tenantId,
          reservationId,
          propertyId,
          roomId,
          checkInDate,
          checkOutDate,
          status,
          guestName,
          sourceType,
        );
      }
    }
  });

  // Projector lag metric
  const lagMs = Date.now() - startTime;
  if (lagMs > 5000) {
    console.warn(`[PMS] Calendar projector lag: ${lagMs}ms for event ${event.eventId}`);
  }
}
