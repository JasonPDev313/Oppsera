import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerDocuments, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerDocumentInput } from '../validation';

export async function addCustomerDocument(ctx: RequestContext, input: AddCustomerDocumentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Insert document
    const [created] = await (tx as any).insert(customerDocuments).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      documentType: input.documentType,
      name: input.name,
      description: input.description ?? null,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: ctx.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).returning();

    // If documentType is 'photo', update the customer's profileImageUrl
    if (input.documentType === 'photo') {
      const profileImageUrl = `/storage/${input.storageKey}`;
      await (tx as any).update(customers).set({ profileImageUrl, updatedAt: new Date() })
        .where(eq(customers.id, input.customerId));
    }

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'system',
      title: `Document added: ${input.documentType} - ${input.name}`,
      metadata: { documentId: created!.id, documentType: input.documentType, name: input.name, storageKey: input.storageKey },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer_document.added.v1', {
      customerId: input.customerId,
      documentId: created!.id,
      documentType: input.documentType,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.document_added', 'customer', input.customerId);
  return result;
}
