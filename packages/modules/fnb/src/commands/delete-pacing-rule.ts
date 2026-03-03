import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbPacingRules } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { HOST_EVENTS } from '../events/host-events';

export interface DeletePacingRuleInput {
  id: string;
  clientRequestId?: string;
}

export async function deletePacingRule(
  ctx: RequestContext,
  input: DeletePacingRuleInput,
): Promise<{ id: string }> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'deletePacingRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as { id: string }, events: [] };
    }

    // Verify the rule exists and belongs to this tenant
    const [existing] = await (tx as any)
      .select()
      .from(fnbPacingRules)
      .where(
        and(
          eq(fnbPacingRules.id, input.id),
          eq(fnbPacingRules.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Pacing rule ${input.id} not found`);
    }

    await (tx as any)
      .delete(fnbPacingRules)
      .where(
        and(
          eq(fnbPacingRules.id, input.id),
          eq(fnbPacingRules.tenantId, ctx.tenantId),
        ),
      );

    const event = buildEventFromContext(ctx, HOST_EVENTS.PACING_RULE_DELETED, {
      ruleId: input.id,
      locationId: existing.locationId,
    });

    const deleted = { id: input.id };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'deletePacingRule', deleted);

    return { result: deleted, events: [event] };
  });

  await auditLog(
    ctx,
    'fnb.pacing.rule_deleted',
    'fnb_pacing_rules',
    input.id,
  );

  return result as { id: string };
}
