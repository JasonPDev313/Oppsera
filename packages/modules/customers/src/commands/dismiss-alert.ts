import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerAlerts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { DismissAlertInput } from '../validation';

export async function dismissAlert(ctx: RequestContext, input: DismissAlertInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find alert by alertId + tenantId
    const [alert] = await (tx as any).select().from(customerAlerts)
      .where(and(eq(customerAlerts.id, input.alertId), eq(customerAlerts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!alert) throw new NotFoundError('Alert', input.alertId);

    // Dismiss the alert
    const [updated] = await (tx as any).update(customerAlerts).set({
      isActive: false,
      dismissedAt: new Date(),
      dismissedBy: ctx.user.id,
    }).where(eq(customerAlerts.id, input.alertId)).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: alert.customerId,
      activityType: 'system',
      title: `Alert dismissed: ${alert.alertType}`,
      metadata: { alertId: alert.id, alertType: alert.alertType },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_alert.dismissed.v1', {
      customerId: alert.customerId,
      alertId: alert.id,
      alertType: alert.alertType,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.alert_dismissed', 'customer', result.customerId);
  return result;
}
