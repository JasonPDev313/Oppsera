import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { NotifyWaitlistGuestInput } from '../validation';

/**
 * Mark a waitlist guest as notified (table ready).
 * V1: manual notification only (host tells guest verbally or via phone).
 * V2: SMS integration via gateway.
 */
export async function notifyWaitlistGuest(
  ctx: RequestContext,
  entryId: string,
  input: NotifyWaitlistGuestInput,
) {
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'notified',
          notified_at = now(),
          notification_count = notification_count + 1,
          last_notification_method = ${input.method ?? 'manual'},
          updated_at = now()
      WHERE id = ${entryId}
        AND tenant_id = ${ctx.tenantId}
        AND status = 'waiting'
      RETURNING id, guest_name, guest_phone, party_size, notification_count
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!updated) throw new AppError('NOT_FOUND', 'Waitlist entry not found or not in waiting status', 404);

    // V2: If method === 'sms' && guest has phone, send SMS via gateway
    // For now, just record the notification

    return {
      id: String(updated.id),
      guestName: String(updated.guest_name),
      guestPhone: updated.guest_phone ? String(updated.guest_phone) : null,
      partySize: Number(updated.party_size),
      notificationCount: Number(updated.notification_count),
      method: input.method ?? 'manual',
    };
  });
}
