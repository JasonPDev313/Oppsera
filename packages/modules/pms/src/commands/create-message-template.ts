/**
 * Create a message template for a property.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsMessageTemplates, pmsProperties } from '@oppsera/db';
import type { CreateMessageTemplateInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createMessageTemplate(ctx: RequestContext, input: CreateMessageTemplateInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    const id = generateUlid();
    await tx.insert(pmsMessageTemplates).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      templateKey: input.templateKey,
      channel: input.channel,
      subject: input.subject ?? null,
      bodyTemplate: input.bodyTemplate,
      isActive: input.isActive ?? true,
    });

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'message_template', id, 'created', {
      templateKey: input.templateKey,
      channel: input.channel,
    });

    return { result: { id }, events: [] };
  });

  await auditLog(ctx, 'pms.message_template.created', 'pms_message_template', result.id);
  return result;
}
