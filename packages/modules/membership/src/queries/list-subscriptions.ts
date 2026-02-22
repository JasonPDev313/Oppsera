import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipSubscriptions, membershipPlans } from '@oppsera/db';

export interface ListSubscriptionsInput {
  tenantId: string;
  membershipAccountId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface SubscriptionEntry {
  id: string;
  membershipAccountId: string;
  planId: string;
  planName: string | null;
  status: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  nextBillDate: string | null;
  lastBilledDate: string | null;
  billedThroughDate: string | null;
  createdAt: string;
}

export interface ListSubscriptionsResult {
  items: SubscriptionEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listSubscriptions(
  input: ListSubscriptionsInput,
): Promise<ListSubscriptionsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(membershipSubscriptions.tenantId, input.tenantId),
      eq(membershipSubscriptions.membershipAccountId, input.membershipAccountId),
    ];

    if (input.status) {
      conditions.push(eq(membershipSubscriptions.status, input.status));
    }

    if (input.cursor) {
      conditions.push(lt(membershipSubscriptions.id, input.cursor));
    }

    const rows = await (tx as any)
      .select({
        id: membershipSubscriptions.id,
        membershipAccountId: membershipSubscriptions.membershipAccountId,
        planId: membershipSubscriptions.planId,
        planName: membershipPlans.name,
        status: membershipSubscriptions.status,
        effectiveStart: membershipSubscriptions.effectiveStart,
        effectiveEnd: membershipSubscriptions.effectiveEnd,
        nextBillDate: membershipSubscriptions.nextBillDate,
        lastBilledDate: membershipSubscriptions.lastBilledDate,
        billedThroughDate: membershipSubscriptions.billedThroughDate,
        createdAt: membershipSubscriptions.createdAt,
      })
      .from(membershipSubscriptions)
      .leftJoin(
        membershipPlans,
        and(
          eq(membershipPlans.id, membershipSubscriptions.planId),
          eq(membershipPlans.tenantId, membershipSubscriptions.tenantId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(membershipSubscriptions.createdAt), desc(membershipSubscriptions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const mapped: SubscriptionEntry[] = items.map((row: any) => ({
      id: String(row.id),
      membershipAccountId: String(row.membershipAccountId),
      planId: String(row.planId),
      planName: row.planName ? String(row.planName) : null,
      status: String(row.status),
      effectiveStart: row.effectiveStart instanceof Date
        ? row.effectiveStart.toISOString()
        : String(row.effectiveStart ?? ''),
      effectiveEnd: row.effectiveEnd instanceof Date
        ? row.effectiveEnd.toISOString()
        : (row.effectiveEnd ? String(row.effectiveEnd) : null),
      nextBillDate: row.nextBillDate instanceof Date
        ? row.nextBillDate.toISOString()
        : (row.nextBillDate ? String(row.nextBillDate) : null),
      lastBilledDate: row.lastBilledDate instanceof Date
        ? row.lastBilledDate.toISOString()
        : (row.lastBilledDate ? String(row.lastBilledDate) : null),
      billedThroughDate: row.billedThroughDate instanceof Date
        ? row.billedThroughDate.toISOString()
        : (row.billedThroughDate ? String(row.billedThroughDate) : null),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    }));

    return {
      items: mapped,
      cursor: hasMore ? mapped[mapped.length - 1]!.id : null,
      hasMore,
    };
  });
}
