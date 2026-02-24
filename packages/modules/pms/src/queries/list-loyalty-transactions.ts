import { eq, and, desc, lt } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsLoyaltyTransactions } from '@oppsera/db';

export interface LoyaltyTransactionItem {
  id: string;
  memberId: string;
  transactionType: string;
  points: number;
  balanceAfter: number;
  reservationId: string | null;
  description: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface ListLoyaltyTransactionsResult {
  items: LoyaltyTransactionItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listLoyaltyTransactions(
  tenantId: string,
  memberId: string,
  cursor?: string | null,
  limit = 50,
): Promise<ListLoyaltyTransactionsResult> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(pmsLoyaltyTransactions.tenantId, tenantId),
      eq(pmsLoyaltyTransactions.memberId, memberId),
    ];

    if (cursor) {
      conditions.push(lt(pmsLoyaltyTransactions.id, cursor));
    }

    const rows = await tx
      .select()
      .from(pmsLoyaltyTransactions)
      .where(and(...conditions))
      .orderBy(desc(pmsLoyaltyTransactions.createdAt), desc(pmsLoyaltyTransactions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        transactionType: r.transactionType,
        points: r.points,
        balanceAfter: r.balanceAfter,
        reservationId: r.reservationId,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
