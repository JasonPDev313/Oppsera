import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerNotes } from '@oppsera/db';

export interface GetCustomerNotesListInput {
  tenantId: string;
  customerId: string;
  cursor?: string;
  limit?: number;
  pinnedOnly?: boolean;
}

export interface CustomerNoteItem {
  id: string;
  customerId: string;
  content: string;
  isPinned: boolean;
  visibility: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
}

export interface GetCustomerNotesListResult {
  items: CustomerNoteItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCustomerNotesList(
  input: GetCustomerNotesListInput,
): Promise<GetCustomerNotesListResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customerNotes.tenantId, input.tenantId),
      eq(customerNotes.customerId, input.customerId),
    ];

    if (input.pinnedOnly) {
      conditions.push(eq(customerNotes.isPinned, true));
    }

    if (input.cursor) {
      conditions.push(lt(customerNotes.id, input.cursor));
    }

    // Pinned notes first, then by createdAt DESC
    const rows = await tx
      .select()
      .from(customerNotes)
      .where(and(...conditions))
      .orderBy(desc(customerNotes.isPinned), desc(customerNotes.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: CustomerNoteItem[] = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      id: row.id,
      customerId: row.customerId,
      content: row.content,
      isPinned: row.isPinned,
      visibility: row.visibility,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      updatedAt: row.updatedAt,
    }));
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
