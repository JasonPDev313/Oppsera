import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerMemberships } from '@oppsera/db';

export interface ListMembershipsInput {
  tenantId: string;
  customerId?: string;
  planId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface ListMembershipsResult {
  items: (typeof customerMemberships.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listMemberships(
  input: ListMembershipsInput,
): Promise<ListMembershipsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(customerMemberships.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(customerMemberships.id, input.cursor));
    }

    if (input.customerId) {
      conditions.push(eq(customerMemberships.customerId, input.customerId));
    }

    if (input.planId) {
      conditions.push(eq(customerMemberships.planId, input.planId));
    }

    if (input.status) {
      conditions.push(eq(customerMemberships.status, input.status));
    }

    const rows = await tx
      .select()
      .from(customerMemberships)
      .where(and(...conditions))
      .orderBy(desc(customerMemberships.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
