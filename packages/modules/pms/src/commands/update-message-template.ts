/**
 * Update a message template.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsMessageTemplates } from '@oppsera/db';
import type { UpdateMessageTemplateInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateMessageTemplate(
  ctx: RequestContext,
  templateId: string,
  input: UpdateMessageTemplateInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsMessageTemplates)
      .where(and(eq(pmsMessageTemplates.id, templateId), eq(pmsMessageTemplates.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('MessageTemplate', templateId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.subject !== undefined) updates.subject = input.subject;
    if (input.bodyTemplate !== undefined) updates.bodyTemplate = input.bodyTemplate;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await tx
      .update(pmsMessageTemplates)
      .set(updates)
      .where(eq(pmsMessageTemplates.id, templateId));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'message_template', templateId, 'updated', updates);

    return { result: { id: templateId }, events: [] };
  });

  await auditLog(ctx, 'pms.message_template.updated', 'pms_message_template', result.id);
  return result;
}
