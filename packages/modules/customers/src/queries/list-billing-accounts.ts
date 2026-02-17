import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { billingAccounts } from '@oppsera/db';

export interface ListBillingAccountsInput {
  tenantId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface ListBillingAccountsResult {
  items: (typeof billingAccounts.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listBillingAccounts(
  input: ListBillingAccountsInput,
): Promise<ListBillingAccountsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(billingAccounts.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(billingAccounts.id, input.cursor));
    }

    if (input.status) {
      conditions.push(eq(billingAccounts.status, input.status));
    }

    const rows = await tx
      .select()
      .from(billingAccounts)
      .where(and(...conditions))
      .orderBy(desc(billingAccounts.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
