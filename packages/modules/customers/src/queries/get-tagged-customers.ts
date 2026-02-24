import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerTags, customers } from '@oppsera/db';

export interface GetTaggedCustomersInput {
  tenantId: string;
  tagId: string;
  cursor?: string;
  limit?: number;
}

export interface TaggedCustomerEntry {
  customerTagId: string;
  customerId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  source: string;
  appliedAt: Date;
  appliedBy: string;
}

export interface GetTaggedCustomersResult {
  items: TaggedCustomerEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getTaggedCustomers(
  input: GetTaggedCustomersInput,
): Promise<GetTaggedCustomersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customerTags.tenantId, input.tenantId),
      eq(customerTags.tagId, input.tagId),
      isNull(customerTags.removedAt),
    ];

    if (input.cursor) {
      conditions.push(sql`${customerTags.id} < ${input.cursor}`);
    }

    const rows = await (tx as any)
      .select({
        customerTagId: customerTags.id,
        customerId: customerTags.customerId,
        displayName: customers.displayName,
        email: customers.email,
        phone: customers.phone,
        source: customerTags.source,
        appliedAt: customerTags.appliedAt,
        appliedBy: customerTags.appliedBy,
      })
      .from(customerTags)
      .innerJoin(customers, eq(customerTags.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(customerTags.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.customerTagId : null;

    return {
      items: items.map((r: any) => ({
        customerTagId: r.customerTagId,
        customerId: r.customerId,
        displayName: r.displayName,
        email: r.email ?? null,
        phone: r.phone ?? null,
        source: r.source,
        appliedAt: r.appliedAt,
        appliedBy: r.appliedBy,
      })),
      cursor: nextCursor,
      hasMore,
    };
  });
}
