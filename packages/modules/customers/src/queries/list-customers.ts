import { eq, and, asc, not, ilike, or, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customers } from '@oppsera/db';

export interface ListCustomersInput {
  tenantId: string;
  search?: string;
  tags?: unknown[];
  cursor?: string;
  limit?: number;
}

export interface ListCustomersResult {
  items: (typeof customers.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listCustomers(input: ListCustomersInput): Promise<ListCustomersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customers.tenantId, input.tenantId),
      not(ilike(customers.displayName, '[MERGED]%')),
    ];

    if (input.cursor) {
      // For displayName ascending pagination, cursor is the last displayName + id composite
      // We use id as a tiebreaker for stable pagination
      conditions.push(
        or(
          sql`${customers.displayName} > (SELECT display_name FROM customers WHERE id = ${input.cursor})`,
          and(
            sql`${customers.displayName} = (SELECT display_name FROM customers WHERE id = ${input.cursor})`,
            sql`${customers.id} > ${input.cursor}`,
          )!,
        )!,
      );
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern),
          ilike(customers.displayName, pattern),
        )!,
      );
    }

    if (input.tags && input.tags.length > 0) {
      conditions.push(sql`${customers.tags} @> ${JSON.stringify(input.tags)}::jsonb`);
    }

    const rows = await tx
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.displayName), asc(customers.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
