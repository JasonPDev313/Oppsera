import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetTipPoolDetailInput } from '../validation';

export interface TipPoolParticipantDetail {
  id: string;
  roleId: string;
  pointsValue: number;
  isContributor: boolean;
  isRecipient: boolean;
}

export interface TipPoolDetail {
  id: string;
  locationId: string;
  name: string;
  poolType: string;
  poolScope: string;
  percentageToPool: string | null;
  distributionMethod: string;
  isActive: boolean;
  participants: TipPoolParticipantDetail[];
}

export async function getTipPoolDetail(
  input: GetTipPoolDetailInput,
): Promise<TipPoolDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const poolRows = await tx.execute(
      sql`SELECT id, location_id, name, pool_type, pool_scope,
                 percentage_to_pool, distribution_method, is_active
          FROM fnb_tip_pools
          WHERE id = ${input.poolId} AND tenant_id = ${input.tenantId}`,
    );
    const pools = Array.from(poolRows as Iterable<Record<string, unknown>>);
    if (pools.length === 0) return null;

    const pool = pools[0]!;

    const participantRows = await tx.execute(
      sql`SELECT id, role_id, points_value, is_contributor, is_recipient
          FROM fnb_tip_pool_participants
          WHERE pool_id = ${input.poolId} AND tenant_id = ${input.tenantId}
          ORDER BY points_value DESC`,
    );

    const participants = Array.from(participantRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      roleId: r.role_id as string,
      pointsValue: Number(r.points_value),
      isContributor: r.is_contributor as boolean,
      isRecipient: r.is_recipient as boolean,
    }));

    return {
      id: pool.id as string,
      locationId: pool.location_id as string,
      name: pool.name as string,
      poolType: pool.pool_type as string,
      poolScope: pool.pool_scope as string,
      percentageToPool: (pool.percentage_to_pool as string) ?? null,
      distributionMethod: pool.distribution_method as string,
      isActive: pool.is_active as boolean,
      participants,
    };
  });
}
