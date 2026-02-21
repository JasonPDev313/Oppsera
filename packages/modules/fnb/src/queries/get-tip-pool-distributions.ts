import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetTipPoolDistributionsInput } from '../validation';

export interface TipPoolDistributionItem {
  id: string;
  poolId: string;
  businessDate: string;
  totalPoolAmountCents: number;
  distributionDetails: unknown[];
  distributedBy: string;
  distributedAt: string;
}

export async function getTipPoolDistributions(
  input: GetTipPoolDistributionsInput,
): Promise<TipPoolDistributionItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, pool_id, business_date, total_pool_amount_cents,
                 distribution_details, distributed_by, distributed_at
          FROM fnb_tip_pool_distributions
          WHERE pool_id = ${input.poolId} AND tenant_id = ${input.tenantId}
            AND business_date = ${input.businessDate}
          ORDER BY distributed_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      poolId: r.pool_id as string,
      businessDate: r.business_date as string,
      totalPoolAmountCents: Number(r.total_pool_amount_cents),
      distributionDetails: r.distribution_details as unknown[],
      distributedBy: r.distributed_by as string,
      distributedAt: (r.distributed_at as Date).toISOString(),
    }));
  });
}
