import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipPlans } from '@oppsera/db';

export interface ListMembershipPlansInput {
  tenantId: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListMembershipPlansResult {
  items: (typeof membershipPlans.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listMembershipPlans(
  input: ListMembershipPlansInput,
): Promise<ListMembershipPlansResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(membershipPlans.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(membershipPlans.id, input.cursor));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(membershipPlans.isActive, input.isActive));
    }

    const rows = await tx
      .select()
      .from(membershipPlans)
      .where(and(...conditions))
      .orderBy(desc(membershipPlans.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
