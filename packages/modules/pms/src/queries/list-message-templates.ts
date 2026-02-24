/**
 * List message templates for a property.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsMessageTemplates } from '@oppsera/db';

export interface MessageTemplateItem {
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

export async function listMessageTemplates(
  tenantId: string,
  propertyId: string,
): Promise<MessageTemplateItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsMessageTemplates)
      .where(
        and(
          eq(pmsMessageTemplates.tenantId, tenantId),
          eq(pmsMessageTemplates.propertyId, propertyId),
        ),
      )
      .orderBy(desc(pmsMessageTemplates.createdAt));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      templateKey: r.templateKey,
      channel: r.channel,
      subject: r.subject,
      bodyTemplate: r.bodyTemplate,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}
