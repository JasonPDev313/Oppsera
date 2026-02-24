/**
 * Get a single message template by ID.
 */
import { and, eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsMessageTemplates } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface MessageTemplateDetail {
  id: string;
  propertyId: string;
  templateKey: string;
  channel: string;
  subject: string | null;
  bodyTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getMessageTemplate(
  tenantId: string,
  templateId: string,
): Promise<MessageTemplateDetail> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsMessageTemplates)
      .where(
        and(
          eq(pmsMessageTemplates.id, templateId),
          eq(pmsMessageTemplates.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!row) throw new NotFoundError('MessageTemplate', templateId);

    return {
      id: row.id,
      propertyId: row.propertyId,
      templateKey: row.templateKey,
      channel: row.channel,
      subject: row.subject,
      bodyTemplate: row.bodyTemplate,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
