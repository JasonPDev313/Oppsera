import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { arTransactions } from '@oppsera/db';

export interface GetArLedgerInput {
  tenantId: string;
  billingAccountId: string;
  cursor?: string;
  limit?: number;
}

export interface GetArLedgerResult {
  items: (typeof arTransactions.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getArLedger(input: GetArLedgerInput): Promise<GetArLedgerResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(arTransactions.tenantId, input.tenantId),
      eq(arTransactions.billingAccountId, input.billingAccountId),
    ];

    if (input.cursor) {
      conditions.push(lt(arTransactions.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(arTransactions)
      .where(and(...conditions))
      .orderBy(desc(arTransactions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
