import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { TipPoolNotFoundError } from '../errors';

interface UpdateTipPoolInput {
  clientRequestId?: string;
  name?: string;
  poolType?: string;
  poolScope?: string;
  percentageToPool?: string;
  distributionMethod?: string;
  isActive?: boolean;
}

export async function updateTipPool(
  ctx: RequestContext,
  poolId: string,
  input: UpdateTipPoolInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateTipPool');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Verify pool exists
    const existing = await tx.execute(
      sql`SELECT id FROM fnb_tip_pools WHERE id = ${poolId} AND tenant_id = ${ctx.tenantId}`,
    );
    const existingRows = Array.from(existing as Iterable<Record<string, unknown>>);
    if (existingRows.length === 0) throw new TipPoolNotFoundError(poolId);

    const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
    if (input.name !== undefined) setClauses.push(sql`name = ${input.name}`);
    if (input.poolType !== undefined) setClauses.push(sql`pool_type = ${input.poolType}`);
    if (input.poolScope !== undefined) setClauses.push(sql`pool_scope = ${input.poolScope}`);
    if (input.percentageToPool !== undefined) setClauses.push(sql`percentage_to_pool = ${input.percentageToPool}`);
    if (input.distributionMethod !== undefined) setClauses.push(sql`distribution_method = ${input.distributionMethod}`);
    if (input.isActive !== undefined) setClauses.push(sql`is_active = ${input.isActive}`);

    const setClause = sql.join(setClauses, sql`, `);

    await tx.execute(
      sql`UPDATE fnb_tip_pools SET ${setClause} WHERE id = ${poolId} AND tenant_id = ${ctx.tenantId}`,
    );

    const updateResult = { id: poolId, updated: true };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateTipPool', updateResult);
    }

    return { result: updateResult, events: [] };
  });

  await auditLog(ctx, 'fnb.tip_pool.updated', 'fnb_tip_pools', poolId);
  return result;
}
