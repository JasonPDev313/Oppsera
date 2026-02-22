import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerNotes } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateCustomerNoteInput } from '../validation';

export async function updateCustomerNote(ctx: RequestContext, input: UpdateCustomerNoteInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Verify note exists
    const [note] = await (tx as any).select().from(customerNotes)
      .where(and(eq(customerNotes.id, input.noteId), eq(customerNotes.tenantId, ctx.tenantId)))
      .limit(1);
    if (!note) throw new NotFoundError('CustomerNote', input.noteId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.content !== undefined) updates.content = input.content;
    if (input.isPinned !== undefined) updates.isPinned = input.isPinned;
    if (input.visibility !== undefined) updates.visibility = input.visibility;

    const [updated] = await (tx as any).update(customerNotes).set(updates)
      .where(eq(customerNotes.id, input.noteId)).returning();

    return updated!;
  });

  await auditLog(ctx, 'customer.note_updated', 'customer_note', input.noteId);
  return result;
}
