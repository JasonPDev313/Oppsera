import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';

export async function removeFromWaitlist(
  ctx: RequestContext,
  entryId: string,
  reason: 'canceled' | 'no_show',
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to remove from waitlist');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = ${reason},
          ${reason === 'canceled' ? sql`canceled_at = now()` : sql`no_show_at = now()`},
          updated_at = now()
      WHERE id = ${entryId}
        AND tenant_id = ${ctx.tenantId}
        AND status IN ('waiting', 'notified')
      RETURNING id, guest_name, party_size, status
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!updated) throw new AppError('NOT_FOUND', 'Waitlist entry not found or already resolved', 404);

    // Recompute positions
    const now = new Date();
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

    const event = buildEventFromContext(ctx, `fnb.waitlist.${reason}.v1`, {
      waitlistEntryId: entryId,
      guestName: String(updated.guest_name),
      partySize: Number(updated.party_size),
    });

    return {
      result: {
        id: String(updated.id),
        guestName: String(updated.guest_name),
        status: reason,
      },
      events: [event],
    };
  });

  await auditLog(ctx, `fnb.waitlist.${reason}`, 'waitlist_entry', entryId);
  return result;
}
