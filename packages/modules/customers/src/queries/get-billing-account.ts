import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  billingAccounts,
  billingAccountMembers,
  arTransactions,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetBillingAccountInput {
  tenantId: string;
  billingAccountId: string;
}

export interface BillingAccountDetail {
  account: typeof billingAccounts.$inferSelect;
  members: (typeof billingAccountMembers.$inferSelect)[];
  recentTransactions: (typeof arTransactions.$inferSelect)[];
  outstandingBalanceCents: number;
}

export async function getBillingAccount(
  input: GetBillingAccountInput,
): Promise<BillingAccountDetail> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch the account
    const [account] = await tx
      .select()
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.id, input.billingAccountId),
          eq(billingAccounts.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('BillingAccount', input.billingAccountId);
    }

    // Fetch members
    const members = await tx
      .select()
      .from(billingAccountMembers)
      .where(
        and(
          eq(billingAccountMembers.tenantId, input.tenantId),
          eq(billingAccountMembers.billingAccountId, input.billingAccountId),
        ),
      );

    // Fetch recent AR transactions and outstanding balance in parallel
    const [recentTransactions, [balanceResult]] = await Promise.all([
      tx
        .select()
        .from(arTransactions)
        .where(
          and(
            eq(arTransactions.tenantId, input.tenantId),
            eq(arTransactions.billingAccountId, input.billingAccountId),
          ),
        )
        .orderBy(desc(arTransactions.createdAt))
        .limit(20),
      tx
        .select({
          balance: sql<number>`coalesce(sum(amount_cents), 0)::int`,
        })
        .from(arTransactions)
        .where(
          and(
            eq(arTransactions.tenantId, input.tenantId),
            eq(arTransactions.billingAccountId, input.billingAccountId),
          ),
        ),
    ]);

    return {
      account,
      members,
      recentTransactions,
      outstandingBalanceCents: balanceResult?.balance ?? 0,
    };
  });
}
