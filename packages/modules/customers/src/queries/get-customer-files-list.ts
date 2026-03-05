import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerDocuments } from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

export interface GetCustomerFilesListInput {
  tenantId: string;
  customerId: string;
  documentType?: string;
  cursor?: string;
  limit?: number;
}

export interface CustomerFileItem {
  id: string;
  customerId: string;
  documentType: string;
  name: string;
  description: string | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  tagsJson: unknown;
  version: number;
  uploadedAt: Date;
  uploadedBy: string;
  expiresAt: Date | null;
}

export interface GetCustomerFilesListResult {
  items: CustomerFileItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCustomerFilesList(
  input: GetCustomerFilesListInput,
): Promise<GetCustomerFilesListResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customerDocuments.tenantId, input.tenantId),
      eq(customerDocuments.customerId, input.customerId),
    ];

    if (input.documentType) {
      conditions.push(eq(customerDocuments.documentType, input.documentType));
    }

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor, 2);
      if (decoded) {
        const [cursorUploadedAt, cursorId] = decoded as [string, string];
        conditions.push(
          sql`(${customerDocuments.uploadedAt}, ${customerDocuments.id}) < (${cursorUploadedAt}::timestamptz, ${cursorId})` as unknown as ReturnType<typeof eq>,
        );
      } else {
        // Legacy: cursor was plain id
        conditions.push(
          sql`${customerDocuments.id} < ${input.cursor}` as unknown as ReturnType<typeof eq>,
        );
      }
    }

    const rows = await tx
      .select()
      .from(customerDocuments)
      .where(and(...conditions))
      .orderBy(desc(customerDocuments.uploadedAt), desc(customerDocuments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items: CustomerFileItem[] = sliced.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      documentType: row.documentType,
      name: row.name,
      description: row.description,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      tagsJson: row.tagsJson,
      version: row.version,
      uploadedAt: row.uploadedAt,
      uploadedBy: row.uploadedBy,
      expiresAt: row.expiresAt,
    }));

    const lastItem = sliced[sliced.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(lastItem.uploadedAt.toISOString(), lastItem.id)
      : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
