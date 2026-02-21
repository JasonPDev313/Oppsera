import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { TipPoolNotFoundError } from '../errors';

interface RemovePoolParticipantInput {
  poolId: string;
  roleId: string;
}

export async function removePoolParticipant(
  ctx: RequestContext,
  input: RemovePoolParticipantInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify pool exists
    const pools = await tx.execute(
      sql`SELECT id FROM fnb_tip_pools WHERE id = ${input.poolId} AND tenant_id = ${ctx.tenantId}`,
    );
    const poolRows = Array.from(pools as Iterable<Record<string, unknown>>);
    if (poolRows.length === 0) throw new TipPoolNotFoundError(input.poolId);

    await tx.execute(
      sql`DELETE FROM fnb_tip_pool_participants
          WHERE pool_id = ${input.poolId} AND role_id = ${input.roleId}
            AND tenant_id = ${ctx.tenantId}`,
    );

    return { result: { poolId: input.poolId, roleId: input.roleId, removed: true }, events: [] };
  });

  await auditLog(ctx, 'fnb.tip_pool.participant_removed', 'fnb_tip_pool_participants', input.poolId);
  return result;
}
