import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerAlerts, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateAlertInput } from '../validation';

export async function createAlert(ctx: RequestContext, input: CreateAlertInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [created] = await (tx as any).insert(customerAlerts).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      alertType: input.alertType,
      severity: input.severity ?? 'info',
      message: input.message,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      metadata: input.metadata ?? null,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Alert created: ${input.alertType}`,
      metadata: { alertId: created!.id, alertType: input.alertType, severity: input.severity ?? 'info' },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_alert.created.v1', {
      customerId: input.customerId,
      alertId: created!.id,
      alertType: input.alertType,
      severity: input.severity ?? 'info',
      message: input.message,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.alert_created', 'customer', input.customerId);
  return result;
}
