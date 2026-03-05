import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerNotes } from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

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
      const decoded = decodeCursor(input.cursor, 3);
      if (decoded) {
        const [cursorPinned, cursorCreatedAt, cursorId] = decoded as [string, string, string];
        // All three sorts are DESC — cast boolean to int for row-value comparison
        conditions.push(
          sql`(${customerNotes.isPinned}::int, ${customerNotes.createdAt}, ${customerNotes.id}) < (${parseInt(cursorPinned, 10)}::int, ${cursorCreatedAt}::timestamptz, ${cursorId})` as unknown as ReturnType<typeof eq>,
        );
      } else {
        // Legacy: cursor was plain id
        conditions.push(
          sql`${customerNotes.id} < ${input.cursor}` as unknown as ReturnType<typeof eq>,
        );
      }
    }

    // Pinned notes first, then by createdAt DESC, then id DESC
    const rows = await tx
      .select()
      .from(customerNotes)
      .where(and(...conditions))
      .orderBy(desc(customerNotes.isPinned), desc(customerNotes.createdAt), desc(customerNotes.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items: CustomerNoteItem[] = sliced.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      content: row.content,
      isPinned: row.isPinned,
      visibility: row.visibility,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      updatedAt: row.updatedAt,
    }));

    const lastItem = sliced[sliced.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(
          lastItem.isPinned ? '1' : '0',
          lastItem.createdAt.toISOString(),
          lastItem.id,
        )
      : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
