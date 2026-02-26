import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { SendGuestNotificationInput } from '../validation-host';
import { getSmsProvider } from '../services/notification-service';

/**
 * HOST V2: Record and dispatch a guest notification.
 * Creates the notification record first, then dispatches async (fire-and-forget).
 * SMS dispatch uses the provider abstraction (Console in dev, Twilio in prod).
 */
export async function sendGuestNotification(
  ctx: RequestContext,
  input: SendGuestNotificationInput,
) {
  const notification = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      INSERT INTO fnb_guest_notifications (
        id, tenant_id, location_id,
        reference_type, reference_id,
        notification_type, channel,
        recipient_phone, recipient_email,
        message_body, status, sent_at
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
        ${input.referenceType}, ${input.referenceId},
        ${input.notificationType}, ${input.channel},
        ${input.recipientPhone ?? null}, ${input.recipientEmail ?? null},
        ${input.messageBody},
        'pending',
        now()
      )
      RETURNING *
    `);

    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    return {
      id: String(created.id),
      referenceType: String(created.reference_type),
      referenceId: String(created.reference_id),
      notificationType: String(created.notification_type),
      channel: String(created.channel),
      recipientPhone: created.recipient_phone ? String(created.recipient_phone) : null,
      recipientEmail: created.recipient_email ? String(created.recipient_email) : null,
      messageBody: String(created.message_body),
      status: String(created.status),
      sentAt: String(created.sent_at),
    };
  });

  // Fire-and-forget SMS dispatch — never blocks the response
  if (input.channel === 'sms' && input.recipientPhone) {
    const tenantId = ctx.tenantId;
    const notificationId = notification.id;
    const fromNumber = process.env.TWILIO_FROM_NUMBER ?? '+10000000000';
    getSmsProvider()
      .sendSms(input.recipientPhone, input.messageBody, fromNumber)
      .then(async (result) => {
        try {
          await withTenant(tenantId, async (tx) => {
            await tx.execute(sql`
              UPDATE fnb_guest_notifications
              SET status = 'delivered',
                  external_id = ${result.externalId},
                  updated_at = now()
              WHERE id = ${notificationId} AND tenant_id = ${tenantId}
            `);
          });
        } catch {
          // Update failed — notification was still sent
        }
      })
      .catch(async (error: unknown) => {
        console.error('[SMS] Dispatch failed:', error);
        try {
          await withTenant(tenantId, async (tx) => {
            await tx.execute(sql`
              UPDATE fnb_guest_notifications
              SET status = 'failed',
                  error_message = ${error instanceof Error ? error.message : 'Unknown error'},
                  updated_at = now()
              WHERE id = ${notificationId} AND tenant_id = ${tenantId}
            `);
          });
        } catch {
          // Update failed
        }
      });
  }

  return notification;
}
