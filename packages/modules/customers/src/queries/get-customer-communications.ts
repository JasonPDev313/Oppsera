import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerCommunications } from '@oppsera/db';

export interface GetCustomerCommsInput {
  tenantId: string;
  customerId: string;
  cursor?: string;
  limit?: number;
}

export interface GetCustomerCommsResult {
  items: (typeof customerCommunications.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCustomerCommunications(
  input: GetCustomerCommsInput,
): Promise<GetCustomerCommsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customerCommunications.tenantId, input.tenantId),
      eq(customerCommunications.customerId, input.customerId),
    ];

    if (input.cursor) {
      conditions.push(lt(customerCommunications.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(customerCommunications)
      .where(and(...conditions))
      .orderBy(desc(customerCommunications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
