import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTipPoolsInput } from '../validation';

export interface TipPoolListItem {
  id: string;
  locationId: string;
  name: string;
  poolType: string;
  poolScope: string;
  percentageToPool: string | null;
  distributionMethod: string;
  isActive: boolean;
  participantCount: number;
}

export async function listTipPools(
  input: ListTipPoolsInput,
): Promise<TipPoolListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`p.tenant_id = ${input.tenantId}`,
      sql`p.location_id = ${input.locationId}`,
    ];

    if (input.isActive !== undefined) {
      conditions.push(sql`p.is_active = ${input.isActive}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT p.id, p.location_id, p.name, p.pool_type, p.pool_scope,
                 p.percentage_to_pool, p.distribution_method, p.is_active,
                 COALESCE(COUNT(pp.id), 0) as participant_count
          FROM fnb_tip_pools p
          LEFT JOIN fnb_tip_pool_participants pp ON pp.pool_id = p.id
          WHERE ${whereClause}
          GROUP BY p.id
          ORDER BY p.name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      locationId: r.location_id as string,
      name: r.name as string,
      poolType: r.pool_type as string,
      poolScope: r.pool_scope as string,
      percentageToPool: (r.percentage_to_pool as string) ?? null,
      distributionMethod: r.distribution_method as string,
      isActive: r.is_active as boolean,
      participantCount: Number(r.participant_count),
    }));
  });
}
