import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';

interface CreateTipPoolInput {
  clientRequestId?: string;
  locationId: string;
  name: string;
  poolType: string;
  poolScope: string;
  percentageToPool?: string;
  distributionMethod: string;
  isActive: boolean;
}

export async function createTipPool(
  ctx: RequestContext,
  input: CreateTipPoolInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createTipPool');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    const rows = await tx.execute(
      sql`INSERT INTO fnb_tip_pools (tenant_id, location_id, name, pool_type,
            pool_scope, percentage_to_pool, distribution_method, is_active)
          VALUES (${ctx.tenantId}, ${input.locationId}, ${input.name}, ${input.poolType},
            ${input.poolScope}, ${input.percentageToPool ?? null},
            ${input.distributionMethod}, ${input.isActive})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const poolResult = {
      id: created.id as string,
      locationId: input.locationId,
      name: input.name,
      poolType: input.poolType,
      poolScope: input.poolScope,
      distributionMethod: input.distributionMethod,
      isActive: input.isActive,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createTipPool', poolResult);
    }

    return { result: poolResult, events: [] };
  });

  await auditLog(ctx, 'fnb.tip_pool.created', 'fnb_tip_pools', result.id);
  return result;
}
