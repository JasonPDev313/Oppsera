import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customers, customerNotes, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddCustomerNoteV2Input } from '../validation';

export async function addCustomerNoteV2(ctx: RequestContext, input: AddCustomerNoteV2Input) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Insert note into customerNotes table
    const [created] = await (tx as any).insert(customerNotes).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      content: input.content,
      isPinned: input.isPinned ?? false,
      visibility: input.visibility ?? 'internal',
      createdBy: ctx.user.id,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      activityType: 'note',
      title: 'Note added',
      details: input.content.substring(0, 200),
      metadata: {
        noteId: created!.id,
        isPinned: input.isPinned ?? false,
        visibility: input.visibility ?? 'internal',
      },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.note.added.v1', {
      customerId: input.customerId,
      noteId: created!.id,
      isPinned: input.isPinned ?? false,
      visibility: input.visibility ?? 'internal',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.note_added', 'customer', input.customerId);
  return result;
}
