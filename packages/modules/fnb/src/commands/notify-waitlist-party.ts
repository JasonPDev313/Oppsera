import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { HostNotifyWaitlistInput } from '../validation-host';
import { validateWaitlistTransition } from '../validation-host';
import { fetchHostWaitlistEntry, mapHostWaitlistRow } from './host-helpers';

/**
 * HOST V2: Notify a waitlist party that their table is ready.
 * Validates state machine: waiting → notified.
 * Records notification in fnb_guest_notifications.
 */
export async function notifyWaitlistParty(
  ctx: RequestContext,
  entryId: string,
  input: HostNotifyWaitlistInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const existing = await fetchHostWaitlistEntry(tx, ctx.tenantId, entryId);
    const oldStatus = String(existing.status);

    if (!validateWaitlistTransition(oldStatus, 'notified')) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition waitlist entry from '${oldStatus}' to 'notified'`,
        409,
      );
    }

    // Update waitlist entry status
    const rows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'notified',
          notified_at = now(),
          notification_count = COALESCE(notification_count, 0) + 1,
          last_notification_method = ${input.method ?? 'manual'},
          updated_at = now()
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Insert guest notification record
    const channel = input.method ?? 'manual';
    await tx.execute(sql`
      INSERT INTO fnb_guest_notifications (
        id, tenant_id, location_id,
        reference_type, reference_id,
        notification_type, channel,
        recipient_phone, message_body,
        status, sent_at
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
        'waitlist', ${entryId},
        'table_ready', ${channel},
        ${existing.guest_phone ? String(existing.guest_phone) : null},
        ${'Your table is ready!'},
        ${channel === 'manual' ? 'delivered' : 'pending'},
        now()
      )
    `);

    const event = buildEventFromContext(ctx, 'fnb.waitlist.notified.v1', {
      waitlistEntryId: entryId,
      guestName: String(existing.guest_name),
      partySize: Number(existing.party_size),
      method: channel,
      notificationCount: Number(updated.notification_count),
    });

    return { result: mapHostWaitlistRow(updated), events: [event] };
  });

  await auditLog(ctx, 'fnb.waitlist.notified', 'waitlist_entry', entryId);
  return result;
}
