import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';

export async function mergeWaitlistEntries(
  ctx: RequestContext,
  primaryId: string,
  secondaryId: string,
): Promise<{ id: string; partySize: number; notes: string | null }> {
  if (!ctx.locationId) throw new Error('Location ID is required');
  if (primaryId === secondaryId) throw new AppError('INVALID_INPUT', 'Cannot merge an entry with itself', 400);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Lock both entries in canonical order to prevent deadlocks
    const lockRows = await tx.execute(sql`
      SELECT id, guest_name, party_size, status, notes
      FROM fnb_waitlist_entries
      WHERE id IN (${primaryId}, ${secondaryId})
        AND tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
      ORDER BY id
      FOR UPDATE
    `);

    const entries = Array.from(lockRows as Iterable<Record<string, unknown>>);
    if (entries.length !== 2) throw new AppError('NOT_FOUND', 'One or both entries not found', 404);

    const primary = entries.find(e => String(e.id) === primaryId)!;
    const secondary = entries.find(e => String(e.id) === secondaryId)!;

    const validStatuses = ['waiting', 'notified'];
    if (!validStatuses.includes(String(primary.status)) || !validStatuses.includes(String(secondary.status))) {
      throw new AppError('INVALID_STATUS', 'Both entries must be in waiting or notified status to merge', 409);
    }

    const newPartySize = Number(primary.party_size) + Number(secondary.party_size);
    const mergeNote = `Merged with ${String(secondary.guest_name)} (party of ${Number(secondary.party_size)})`;
    const existingNotes = primary.notes ? String(primary.notes) : '';
    const combinedNotes = existingNotes ? `${existingNotes}\n${mergeNote}` : mergeNote;

    // Update primary entry with combined party size
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET party_size = ${newPartySize},
          notes = ${combinedNotes},
          updated_at = now()
      WHERE id = ${primaryId} AND tenant_id = ${ctx.tenantId}
    `);

    // Cancel secondary entry
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'canceled',
          canceled_at = now(),
          notes = COALESCE(notes || E'\n', '') || ${'Merged into ' + String(primary.guest_name) + ' party'},
          updated_at = now()
      WHERE id = ${secondaryId} AND tenant_id = ${ctx.tenantId}
    `);

    // Recompute positions for remaining active entries
    await tx.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, added_at ASC) AS new_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${ctx.tenantId}
          AND location_id = ${ctx.locationId}
          AND business_date = (SELECT business_date FROM fnb_waitlist_entries WHERE id = ${primaryId})
          AND status IN ('waiting', 'notified')
      )
      UPDATE fnb_waitlist_entries e
      SET position = r.new_pos, updated_at = now()
      FROM ranked r WHERE e.id = r.id AND e.position != r.new_pos
    `);

    const event = buildEventFromContext(ctx, 'fnb.waitlist.merged.v1', {
      primaryId, secondaryId, newPartySize,
    });

    return {
      result: { id: primaryId, partySize: newPartySize, notes: combinedNotes },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'fnb.waitlist.merged', 'waitlist_entry', primaryId);
  return result;
}
