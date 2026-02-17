import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { arTransactions, arAllocations } from '@oppsera/db';

export interface GetAgingReportInput {
  tenantId: string;
  billingAccountId: string;
}

export interface AgingReport {
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyDay: number;
  overHundredTwenty: number;
  total: number;
}

export async function getAgingReport(input: GetAgingReportInput): Promise<AgingReport> {
  return withTenant(input.tenantId, async (tx) => {
    // Compute aging buckets from charge transactions based on their due date.
    // Each charge's outstanding amount = charge amount - sum of allocations against it.
    // We bucket the outstanding amount by how many days past due the charge is.
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
            and ${arTransactions.billingAccountId} = ${input.billingAccountId}
            and ${arTransactions.type} = 'charge'
            and ${arTransactions.dueDate} is not null
        ) as aged_charges`,
      )
      .where(sql`outstanding > 0`);

    return {
      current: result?.current ?? 0,
      thirtyDay: result?.thirtyDay ?? 0,
      sixtyDay: result?.sixtyDay ?? 0,
      ninetyDay: result?.ninetyDay ?? 0,
      overHundredTwenty: result?.overHundredTwenty ?? 0,
      total: result?.total ?? 0,
    };
  });
}
