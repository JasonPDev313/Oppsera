import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { SeatFromWaitlistInput } from '../validation';

export async function seatFromWaitlist(
  ctx: RequestContext,
  entryId: string,
  input: SeatFromWaitlistInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch entry
    const entryRows = await tx.execute(sql`
      SELECT * FROM fnb_waitlist_entries
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
      FOR UPDATE
    `);
    const entry = Array.from(entryRows as Iterable<Record<string, unknown>>)[0];
    if (!entry) throw new AppError('NOT_FOUND', 'Waitlist entry not found', 404);
    if (entry.status !== 'waiting' && entry.status !== 'notified') {
      throw new AppError('INVALID_STATUS', `Cannot seat entry with status '${entry.status}'`, 409);
    }

    // Verify table is available
    const tableRows = await tx.execute(sql`
      SELECT ls.status, t.capacity_max, t.display_label
      FROM fnb_tables t
      LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
      WHERE t.id = ${input.tableId} AND t.tenant_id = ${ctx.tenantId}
    `);
    const table = Array.from(tableRows as Iterable<Record<string, unknown>>)[0];
    if (!table) throw new AppError('NOT_FOUND', 'Table not found', 404);
    if (table.status && table.status !== 'available' && table.status !== 'reserved') {
      throw new AppError('TABLE_OCCUPIED', 'Table is not available', 409);
    }

    const now = new Date();
    const addedAt = new Date(String(entry.added_at));
    const actualWaitMinutes = Math.round((now.getTime() - addedAt.getTime()) / 60000);

    // Determine server — use input, or rotation-based auto-assign
    let serverUserId = input.serverUserId ?? null;
    if (!serverUserId) {
      const rotationRows = await tx.execute(sql`
        SELECT next_server_user_id FROM fnb_rotation_tracker
        WHERE tenant_id = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = ${now.toISOString().slice(0, 10)}
        LIMIT 1
      `);
      const rotation = Array.from(rotationRows as Iterable<Record<string, unknown>>)[0];
      if (rotation) serverUserId = String(rotation.next_server_user_id);
    }

    // Update waitlist entry
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'seated',
          seated_at = now(),
          actual_wait_minutes = ${actualWaitMinutes},
          seated_table_id = ${input.tableId},
          seated_server_user_id = ${serverUserId},
          updated_at = now()
      WHERE id = ${entryId}
    `);

    // Update table live status to seated
    await tx.execute(sql`
      INSERT INTO fnb_table_live_status (id, tenant_id, table_id, status, party_size, current_server_user_id, seated_at, guest_names, waitlist_entry_id)
      VALUES (gen_random_uuid()::text, ${ctx.tenantId}, ${input.tableId}, 'seated', ${Number(entry.party_size)}, ${serverUserId}, now(), ${String(entry.guest_name)}, ${entryId})
      ON CONFLICT (tenant_id, table_id) DO UPDATE SET
        status = 'seated',
        party_size = ${Number(entry.party_size)},
        current_server_user_id = ${serverUserId},
        seated_at = now(),
        guest_names = ${String(entry.guest_name)},
        waitlist_entry_id = ${entryId},
        updated_at = now(),
        version = fnb_table_live_status.version + 1
    `);

    // Record wait time history for estimation
    await tx.execute(sql`
      INSERT INTO fnb_wait_time_history (
        id, tenant_id, location_id, business_date,
        party_size, quoted_wait_minutes, actual_wait_minutes,
        seating_preference, day_of_week, hour_of_day, was_reservation
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
        ${now.toISOString().slice(0, 10)},
        ${Number(entry.party_size)}, ${entry.quoted_wait_minutes ?? null}, ${actualWaitMinutes},
        ${entry.seating_preference ?? null}, ${now.getDay()}, ${now.getHours()}, false
      )
    `);

    // Recompute positions for remaining waiting entries
    await tx.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, added_at ASC) AS new_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = ${now.toISOString().slice(0, 10)}
          AND status = 'waiting'
      )
      UPDATE fnb_waitlist_entries w
      SET position = ranked.new_pos
      FROM ranked
      WHERE w.id = ranked.id
    `);

    const event = buildEventFromContext(ctx, 'fnb.waitlist.seated.v1', {
      waitlistEntryId: entryId,
      tableId: input.tableId,
      tableLabel: String(table.display_label),
      guestName: String(entry.guest_name),
      partySize: Number(entry.party_size),
      actualWaitMinutes,
      serverUserId,
    });

    return {
      result: {
        id: entryId,
        tableId: input.tableId,
        tableLabel: String(table.display_label),
        guestName: String(entry.guest_name),
        partySize: Number(entry.party_size),
        actualWaitMinutes,
        serverUserId,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.waitlist.seated', 'waitlist_entry', entryId);
  return result;
}
