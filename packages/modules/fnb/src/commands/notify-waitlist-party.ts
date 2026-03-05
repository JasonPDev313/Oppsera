import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { HostNotifyWaitlistInput } from '../validation-host';
import { validateWaitlistTransition } from '../validation-host';
import { fetchHostWaitlistEntry, mapHostWaitlistRow } from './host-helpers';
import { sendGuestNotification } from './send-guest-notification';
import { renderTemplate } from '../services/notification-templates';

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
  if (!ctx.locationId) {
    throw new Error('Location ID is required to notify a waitlist party');
  }

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

    const channel = input.method ?? 'manual';

    // For manual notifications, create the record inline (no external dispatch needed).
    // For SMS, sendGuestNotification handles record creation + dispatch after the tx.
    if (channel === 'manual') {
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
          'table_ready', 'manual',
          ${existing.guest_phone ? String(existing.guest_phone) : null},
          'Your table is ready!',
          'delivered',
          now()
        )
      `);
    }

    const event = buildEventFromContext(ctx, 'fnb.waitlist.notified.v1', {
      waitlistEntryId: entryId,
      guestName: String(existing.guest_name),
      partySize: Number(existing.party_size),
      method: channel,
      notificationCount: Number(updated.notification_count),
    });

    return { result: mapHostWaitlistRow(updated), events: [event] };
  });

  // Dispatch SMS if the notification method is sms and the guest has a phone number.
  // Wrapped in try/catch — SMS failure must NOT fail the notify operation;
  // the entry is already marked notified in the outbox transaction.
  if (input.method === 'sms' && result.guestPhone) {
    try {
      const guestPhone = result.guestPhone;
      const guestName = result.guestName;

      // Look up tenant slug + location name for the status URL and template
      const [tenantInfo] = await withTenant(ctx.tenantId, async (tx) => {
        const rows = await tx.execute(sql`
          SELECT t.slug, l.name AS location_name
          FROM tenants t
          LEFT JOIN locations l ON l.id = ${ctx.locationId ?? ''} AND l.tenant_id = t.id
          WHERE t.id = ${ctx.tenantId}
          LIMIT 1
        `);
        return Array.from(rows as Iterable<Record<string, unknown>>);
      });
      const tenantSlug = tenantInfo?.slug ? String(tenantInfo.slug) : ctx.tenantId;
      const venueName = tenantInfo?.location_name ? String(tenantInfo.location_name) : tenantSlug;

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.oppsera.com';
      const statusUrl = `${baseUrl}/waitlist/${tenantSlug}/status/${result.guestToken ?? entryId}`;
      const messageBody = renderTemplate('table_ready', {
        guestName,
        venueName,
        expiryMinutes: 10,
        statusUrl,
      });
      await sendGuestNotification(ctx, {
        referenceType: 'waitlist',
        referenceId: entryId,
        notificationType: 'table_ready',
        channel: 'sms',
        recipientPhone: guestPhone,
        messageBody,
      });
    } catch (smsError: unknown) {
      console.error('[notifyWaitlistParty] SMS dispatch failed — entry already notified:', smsError);
    }
  }

  auditLogDeferred(ctx, 'fnb.waitlist.notified', 'waitlist_entry', entryId);
  return result;
}
