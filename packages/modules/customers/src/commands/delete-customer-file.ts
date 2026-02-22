import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerDocuments, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { DeleteCustomerFileInput } from '../validation';

export async function deleteCustomerFile(ctx: RequestContext, input: DeleteCustomerFileInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify document exists
    const [doc] = await (tx as any).select().from(customerDocuments)
      .where(and(eq(customerDocuments.id, input.documentId), eq(customerDocuments.tenantId, ctx.tenantId)))
      .limit(1);
    if (!doc) throw new NotFoundError('CustomerDocument', input.documentId);

    // Delete the document record
    await (tx as any).delete(customerDocuments)
      .where(eq(customerDocuments.id, input.documentId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: doc.customerId,
      activityType: 'system',
      title: `File deleted: ${doc.documentType} - ${doc.name}`,
      metadata: {
        documentId: doc.id,
        documentType: doc.documentType,
        name: doc.name,
        storageKey: doc.storageKey,
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.file.deleted.v1', {
      customerId: doc.customerId,
      documentId: doc.id,
      documentType: doc.documentType,
      name: doc.name,
      storageKey: doc.storageKey,
    });

    return { result: { id: input.documentId, deleted: true }, events: [event] };
  });

  await auditLog(ctx, 'customer.file_deleted', 'customer_document', input.documentId);
  return result;
}
