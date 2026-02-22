import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { arTransactions, arAllocations, billingAccounts } from '@oppsera/db';

export interface GetCustomerAgingSummaryInput {
  tenantId: string;
  customerId: string;
}

export interface AgingBucket {
  label: string;
  count: number;
  totalCents: number;
}

export interface AccountAgingEntry {
  accountId: string;
  accountName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  totalCents: number;
}

export interface CustomerAgingSummary {
  buckets: AgingBucket[];
  byAccount: AccountAgingEntry[];
  totalOutstandingCents: number;
}

export async function getCustomerAgingSummary(
  input: GetCustomerAgingSummaryInput,
): Promise<CustomerAgingSummary> {
  return withTenant(input.tenantId, async (tx) => {
    // Get all billing account IDs for this customer
    const accountRows = await tx
      .select({
        id: billingAccounts.id,
        name: billingAccounts.name,
      })
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.tenantId, input.tenantId),
          eq(billingAccounts.primaryCustomerId, input.customerId),
        ),
      );

    if (accountRows.length === 0) {
      return {
        buckets: [
          { label: 'Current', count: 0, totalCents: 0 },
          { label: '1-30 Days', count: 0, totalCents: 0 },
          { label: '31-60 Days', count: 0, totalCents: 0 },
          { label: '61-90 Days', count: 0, totalCents: 0 },
          { label: '90+ Days', count: 0, totalCents: 0 },
        ],
        byAccount: [],
        totalOutstandingCents: 0,
      };
    }

    const accountIds = accountRows.map((a) => a.id);
    const accountNameMap = new Map(accountRows.map((a) => [a.id, a.name]));

    // Compute outstanding per charge with aging bucket classification
    const agingRows = await tx
      .select({
        billingAccountId: arTransactions.billingAccountId,
        bucket: sql<string>`case
          when ${arTransactions.dueDate} >= current_date then 'current'
          when ${arTransactions.dueDate} >= current_date - 30 then '1-30'
          when ${arTransactions.dueDate} >= current_date - 60 then '31-60'
          when ${arTransactions.dueDate} >= current_date - 90 then '61-90'
          else '90+'
        end`,
        chargeCount: sql<number>`count(*)::int`,
        totalOutstanding: sql<number>`coalesce(sum(
          ${arTransactions.amountCents} - coalesce(
            (select sum(${arAllocations.amountCents})
             from ${arAllocations}
             where ${arAllocations.chargeTransactionId} = ${arTransactions.id}
               and ${arAllocations.tenantId} = ${input.tenantId}),
            0
          )
        ), 0)::int`,
      })
      .from(arTransactions)
      .where(
        and(
          eq(arTransactions.tenantId, input.tenantId),
          eq(arTransactions.type, 'charge'),
          sql`${arTransactions.dueDate} is not null`,
          sql`${arTransactions.billingAccountId} in (${sql.join(accountIds.map((id) => sql`${id}`), sql`, `)})`,
          // Only include charges with positive outstanding balance
          sql`(${arTransactions.amountCents} - coalesce(
            (select sum(${arAllocations.amountCents})
             from ${arAllocations}
             where ${arAllocations.chargeTransactionId} = ${arTransactions.id}
               and ${arAllocations.tenantId} = ${input.tenantId}),
            0
          )) > 0`,
        ),
      )
      .groupBy(
        arTransactions.billingAccountId,
        sql`case
          when ${arTransactions.dueDate} >= current_date then 'current'
          when ${arTransactions.dueDate} >= current_date - 30 then '1-30'
          when ${arTransactions.dueDate} >= current_date - 60 then '31-60'
          when ${arTransactions.dueDate} >= current_date - 90 then '61-90'
          else '90+'
        end`,
      );

    // Aggregate into bucket totals
    const bucketMap: Record<string, { count: number; totalCents: number }> = {
      current: { count: 0, totalCents: 0 },
      '1-30': { count: 0, totalCents: 0 },
      '31-60': { count: 0, totalCents: 0 },
      '61-90': { count: 0, totalCents: 0 },
      '90+': { count: 0, totalCents: 0 },
    };

    // Per-account breakdown
    const accountMap = new Map<
      string,
      { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number; totalCents: number }
    >();

    for (const accountId of accountIds) {
      accountMap.set(accountId, {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        days90plus: 0,
        totalCents: 0,
      });
    }

    let totalOutstandingCents = 0;

    for (const row of agingRows) {
      const bucket = row.bucket;
      const amount = Number(row.totalOutstanding);
      const count = Number(row.chargeCount);

      if (bucketMap[bucket]) {
        bucketMap[bucket].count += count;
        bucketMap[bucket].totalCents += amount;
      }

      totalOutstandingCents += amount;

      const acctEntry = accountMap.get(row.billingAccountId);
      if (acctEntry) {
        acctEntry.totalCents += amount;
        switch (bucket) {
          case 'current':
            acctEntry.current += amount;
            break;
          case '1-30':
            acctEntry.days1to30 += amount;
            break;
          case '31-60':
            acctEntry.days31to60 += amount;
            break;
          case '61-90':
            acctEntry.days61to90 += amount;
            break;
          case '90+':
            acctEntry.days90plus += amount;
            break;
        }
      }
    }

    const buckets: AgingBucket[] = [
      { label: 'Current', count: bucketMap['current']!.count, totalCents: bucketMap['current']!.totalCents },
      { label: '1-30 Days', count: bucketMap['1-30']!.count, totalCents: bucketMap['1-30']!.totalCents },
      { label: '31-60 Days', count: bucketMap['31-60']!.count, totalCents: bucketMap['31-60']!.totalCents },
      { label: '61-90 Days', count: bucketMap['61-90']!.count, totalCents: bucketMap['61-90']!.totalCents },
      { label: '90+ Days', count: bucketMap['90+']!.count, totalCents: bucketMap['90+']!.totalCents },
    ];

    const byAccount: AccountAgingEntry[] = accountIds
      .map((id) => {
        const entry = accountMap.get(id)!;
        return {
          accountId: id,
          accountName: accountNameMap.get(id) ?? '',
          current: entry.current,
          days1to30: entry.days1to30,
          days31to60: entry.days31to60,
          days61to90: entry.days61to90,
          days90plus: entry.days90plus,
          totalCents: entry.totalCents,
        };
      })
      .filter((entry) => entry.totalCents > 0);

    return { buckets, byAccount, totalOutstandingCents };
  });
}
