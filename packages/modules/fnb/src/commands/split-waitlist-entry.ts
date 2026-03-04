import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';

export interface SplitWaitlistInput {
  newPartySize: number;
  newGuestName: string;
  newGuestPhone?: string;
}

export async function splitWaitlistEntry(
  ctx: RequestContext,
  entryId: string,
  input: SplitWaitlistInput,
): Promise<{ originalId: string; newId: string; originalPartySize: number; newPartySize: number }> {
  if (!ctx.locationId) throw new Error('Location ID is required');

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Lock the entry
    const lockRows = await tx.execute(sql`
      SELECT id, guest_name, party_size, status, position, business_date, priority,
             seating_preference, source, quoted_wait_minutes
      FROM fnb_waitlist_entries
      WHERE id = ${entryId}
        AND tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
      FOR UPDATE
    `);

    const entry = Array.from(lockRows as Iterable<Record<string, unknown>>)[0];
    if (!entry) throw new AppError('NOT_FOUND', 'Waitlist entry not found', 404);

    if (!['waiting', 'notified'].includes(String(entry.status))) {
      throw new AppError('INVALID_STATUS', 'Entry must be in waiting or notified status to split', 409);
    }

    const currentSize = Number(entry.party_size);
    if (input.newPartySize >= currentSize) {
      throw new AppError('INVALID_INPUT', 'New party size must be less than current party size', 400);
    }
    if (input.newPartySize < 1) {
      throw new AppError('INVALID_INPUT', 'New party size must be at least 1', 400);
    }

    const remainingSize = currentSize - input.newPartySize;
    const currentPos = Number(entry.position);

    // Update original entry with reduced size
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET party_size = ${remainingSize},
          notes = COALESCE(notes || E'\n', '') || ${'Split: ' + input.newPartySize + ' guests moved to new entry'},
          updated_at = now()
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
    `);

    // Shift positions to make room for the new entry
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET position = position + 1, updated_at = now()
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
        AND business_date = ${String(entry.business_date)}
        AND status IN ('waiting', 'notified')
        AND position > ${currentPos}
    `);

    // Insert new entry right after original
    const newRows = await tx.execute(sql`
      INSERT INTO fnb_waitlist_entries (
        id, tenant_id, location_id, business_date,
        guest_name, guest_phone, party_size,
        quoted_wait_minutes, status, position, priority,
        seating_preference, source, notes
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId}, ${String(entry.business_date)},
        ${input.newGuestName}, ${input.newGuestPhone ?? null}, ${input.newPartySize},
        ${entry.quoted_wait_minutes}, ${String(entry.status)}, ${currentPos + 1}, ${Number(entry.priority)},
        ${entry.seating_preference ? String(entry.seating_preference) : null},
        ${String(entry.source)},
        ${'Split from ' + String(entry.guest_name) + ' party'}
      )
      RETURNING id
    `);

    const newEntry = Array.from(newRows as Iterable<Record<string, unknown>>)[0]!;
    const newId = String(newEntry.id);

    const event = buildEventFromContext(ctx, 'fnb.waitlist.split.v1', {
      originalId: entryId, newId, originalPartySize: remainingSize, newPartySize: input.newPartySize,
    });

    return {
      result: { originalId: entryId, newId, originalPartySize: remainingSize, newPartySize: input.newPartySize },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.waitlist.split', 'waitlist_entry', entryId);
  return result;
}
