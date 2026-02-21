import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { TipPoolNotFoundError, TipPoolParticipantExistsError } from '../errors';

interface AddPoolParticipantInput {
  clientRequestId?: string;
  poolId: string;
  roleId: string;
  pointsValue: number;
  isContributor: boolean;
  isRecipient: boolean;
}

export async function addPoolParticipant(
  ctx: RequestContext,
  input: AddPoolParticipantInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'addPoolParticipant');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Verify pool exists
    const pools = await tx.execute(
      sql`SELECT id FROM fnb_tip_pools WHERE id = ${input.poolId} AND tenant_id = ${ctx.tenantId}`,
    );
    const poolRows = Array.from(pools as Iterable<Record<string, unknown>>);
    if (poolRows.length === 0) throw new TipPoolNotFoundError(input.poolId);

    // Check for duplicate
    const existing = await tx.execute(
      sql`SELECT id FROM fnb_tip_pool_participants
          WHERE pool_id = ${input.poolId} AND role_id = ${input.roleId}`,
    );
    const existingRows = Array.from(existing as Iterable<Record<string, unknown>>);
    if (existingRows.length > 0) throw new TipPoolParticipantExistsError(input.poolId, input.roleId);

    const rows = await tx.execute(
      sql`INSERT INTO fnb_tip_pool_participants (tenant_id, pool_id, role_id,
            points_value, is_contributor, is_recipient)
          VALUES (${ctx.tenantId}, ${input.poolId}, ${input.roleId},
            ${input.pointsValue}, ${input.isContributor}, ${input.isRecipient})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const participantResult = {
      id: created.id as string,
      poolId: input.poolId,
      roleId: input.roleId,
      pointsValue: input.pointsValue,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'addPoolParticipant', participantResult);
    }

    return { result: participantResult, events: [] };
  });

  await auditLog(ctx, 'fnb.tip_pool.participant_added', 'fnb_tip_pool_participants', result.id);
  return result;
}
