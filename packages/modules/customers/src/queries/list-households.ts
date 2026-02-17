import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerHouseholds,
  customerHouseholdMembers,
} from '@oppsera/db';

export interface ListHouseholdsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface HouseholdListItem {
  household: typeof customerHouseholds.$inferSelect;
  memberCount: number;
  primaryCustomerDisplayName: string;
}

export interface ListHouseholdsResult {
  items: HouseholdListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listHouseholds(
  input: ListHouseholdsInput,
): Promise<ListHouseholdsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(customerHouseholds.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(customerHouseholds.id, input.cursor));
    }

    const rows = await tx
      .select({
        household: customerHouseholds,
        primaryCustomerDisplayName: customers.displayName,
        memberCount: sql<number>`(
          select count(*)::int
          from ${customerHouseholdMembers}
          where ${customerHouseholdMembers.householdId} = ${customerHouseholds.id}
            and ${customerHouseholdMembers.tenantId} = ${input.tenantId}
            and ${customerHouseholdMembers.leftAt} is null
        )`,
      })
      .from(customerHouseholds)
      .innerJoin(customers, eq(customerHouseholds.primaryCustomerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(customerHouseholds.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.household.id : null;

    return {
      items: items.map((row) => ({
        household: row.household,
        memberCount: row.memberCount,
        primaryCustomerDisplayName: row.primaryCustomerDisplayName,
      })),
      cursor: nextCursor,
      hasMore,
    };
  });
}
