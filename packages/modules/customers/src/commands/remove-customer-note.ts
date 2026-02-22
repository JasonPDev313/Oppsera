import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerNotes, customerActivityLog } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RemoveCustomerNoteInput } from '../validation';

export async function removeCustomerNote(ctx: RequestContext, input: RemoveCustomerNoteInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Verify note exists
    const [note] = await (tx as any).select().from(customerNotes)
      .where(and(eq(customerNotes.id, input.noteId), eq(customerNotes.tenantId, ctx.tenantId)))
      .limit(1);
    if (!note) throw new NotFoundError('CustomerNote', input.noteId);

    // Delete the note
    await (tx as any).delete(customerNotes)
      .where(eq(customerNotes.id, input.noteId));

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: note.customerId,
      activityType: 'system',
      title: 'Note removed',
      details: note.content.substring(0, 200),
      metadata: { noteId: note.id },
      createdBy: ctx.user.id,
    });

    return { id: input.noteId, deleted: true };
  });

  await auditLog(ctx, 'customer.note_removed', 'customer_note', input.noteId);
  return result;
}
