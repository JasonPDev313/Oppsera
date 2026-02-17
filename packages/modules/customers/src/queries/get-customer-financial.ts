import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  billingAccounts,
  billingAccountMembers,
  arTransactions,
  arAllocations,
  statements,
  customerWalletAccounts,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetCustomerFinancialInput {
  tenantId: string;
  customerId: string;
}

export interface ArAgingBuckets {
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyDay: number;
  overHundredTwenty: number;
  total: number;
}

export interface CustomerFinancialResult {
  billingAccounts: (typeof billingAccounts.$inferSelect)[];
  arAging: ArAgingBuckets;
  openInvoices: (typeof statements.$inferSelect)[];
  recentPayments: (typeof arTransactions.$inferSelect)[];
  walletAccounts: (typeof customerWalletAccounts.$inferSelect)[];
  walletBalanceCents: number;
  loyaltyTier: string | null;
  loyaltyPointsBalance: number;
}

export async function getCustomerFinancial(
  input: GetCustomerFinancialInput,
): Promise<CustomerFinancialResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch the customer for wallet/loyalty fields
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!customer) {
      throw new NotFoundError('Customer', input.customerId);
    }

    // Fetch billing accounts where customer is primary
    const primaryAccounts = await tx
      .select()
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.tenantId, input.tenantId),
          eq(billingAccounts.primaryCustomerId, input.customerId),
        ),
      );

    // Fetch billing accounts where customer is a member
    const memberAccountLinks = await tx
      .select({ billingAccountId: billingAccountMembers.billingAccountId })
      .from(billingAccountMembers)
      .where(
        and(
          eq(billingAccountMembers.tenantId, input.tenantId),
          eq(billingAccountMembers.customerId, input.customerId),
        ),
      );

    const memberAccountIds = memberAccountLinks.map((l) => l.billingAccountId);
    const primaryAccountIds = new Set(primaryAccounts.map((a) => a.id));
    const additionalIds = memberAccountIds.filter((id) => !primaryAccountIds.has(id));

    let memberAccounts: (typeof billingAccounts.$inferSelect)[] = [];
    if (additionalIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      memberAccounts = await tx
        .select()
        .from(billingAccounts)
        .where(
          and(
            eq(billingAccounts.tenantId, input.tenantId),
            inArray(billingAccounts.id, additionalIds),
          ),
        );
    }

    const allAccounts = [...primaryAccounts, ...memberAccounts];
    const allAccountIds = allAccounts.map((a) => a.id);

    // Compute aggregate aging across all billing accounts
    let arAging: ArAgingBuckets = {
      current: 0,
      thirtyDay: 0,
      sixtyDay: 0,
      ninetyDay: 0,
      overHundredTwenty: 0,
      total: 0,
    };

    if (allAccountIds.length > 0) {
      const [result] = await tx
        .select({
          current: sql<number>`coalesce(sum(
            case when ${arTransactions.dueDate} >= current_date then outstanding end
          ), 0)::int`,
          thirtyDay: sql<number>`coalesce(sum(
            case when ${arTransactions.dueDate} < current_date
              and ${arTransactions.dueDate} >= current_date - 30 then outstanding end
          ), 0)::int`,
          sixtyDay: sql<number>`coalesce(sum(
            case when ${arTransactions.dueDate} < current_date - 30
              and ${arTransactions.dueDate} >= current_date - 60 then outstanding end
          ), 0)::int`,
          ninetyDay: sql<number>`coalesce(sum(
            case when ${arTransactions.dueDate} < current_date - 60
              and ${arTransactions.dueDate} >= current_date - 90 then outstanding end
          ), 0)::int`,
          overHundredTwenty: sql<number>`coalesce(sum(
            case when ${arTransactions.dueDate} < current_date - 90 then outstanding end
          ), 0)::int`,
          total: sql<number>`coalesce(sum(outstanding), 0)::int`,
        })
        .from(
          sql`(
            select
              ${arTransactions.id},
              ${arTransactions.dueDate},
              ${arTransactions.amountCents} - coalesce(
                (select sum(${arAllocations.amountCents})
                 from ${arAllocations}
                 where ${arAllocations.chargeTransactionId} = ${arTransactions.id}
                   and ${arAllocations.tenantId} = ${input.tenantId}),
                0
              ) as outstanding
            from ${arTransactions}
            where ${arTransactions.tenantId} = ${input.tenantId}
              and ${arTransactions.billingAccountId} in (${sql.join(allAccountIds.map((id) => sql`${id}`), sql`, `)})
              and ${arTransactions.type} = 'charge'
              and ${arTransactions.dueDate} is not null
          ) as aged_charges`,
        )
        .where(sql`outstanding > 0`);

      if (result) {
        arAging = {
          current: result.current ?? 0,
          thirtyDay: result.thirtyDay ?? 0,
          sixtyDay: result.sixtyDay ?? 0,
          ninetyDay: result.ninetyDay ?? 0,
          overHundredTwenty: result.overHundredTwenty ?? 0,
          total: result.total ?? 0,
        };
      }
    }

    // Fetch open statements across all billing accounts
    let openInvoices: (typeof statements.$inferSelect)[] = [];
    if (allAccountIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      openInvoices = await tx
        .select()
        .from(statements)
        .where(
          and(
            eq(statements.tenantId, input.tenantId),
            inArray(statements.billingAccountId, allAccountIds),
            eq(statements.status, 'open'),
          ),
        );
    }

    // Fetch recent AR payments (type='payment', last 10) across all billing accounts
    let recentPayments: (typeof arTransactions.$inferSelect)[] = [];
    if (allAccountIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      recentPayments = await tx
        .select()
        .from(arTransactions)
        .where(
          and(
            eq(arTransactions.tenantId, input.tenantId),
            inArray(arTransactions.billingAccountId, allAccountIds),
            eq(arTransactions.type, 'payment'),
          ),
        )
        .orderBy(desc(arTransactions.createdAt))
        .limit(10);
    }

    // Fetch wallet accounts (status='active')
    const walletAccounts = await tx
      .select()
      .from(customerWalletAccounts)
      .where(
        and(
          eq(customerWalletAccounts.tenantId, input.tenantId),
          eq(customerWalletAccounts.customerId, input.customerId),
          eq(customerWalletAccounts.status, 'active'),
        ),
      );

    return {
      billingAccounts: allAccounts,
      arAging,
      openInvoices,
      recentPayments,
      walletAccounts,
      walletBalanceCents: customer.walletBalanceCents,
      loyaltyTier: customer.loyaltyTier,
      loyaltyPointsBalance: customer.loyaltyPointsBalance,
    };
  });
}
