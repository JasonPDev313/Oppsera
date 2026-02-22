import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerDocuments } from '@oppsera/db';

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
      conditions.push(lt(customerDocuments.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(customerDocuments)
      .where(and(...conditions))
      .orderBy(desc(customerDocuments.uploadedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: CustomerFileItem[] = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
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
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
