import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbPacingRules } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { HOST_EVENTS } from '../events/host-events';

export interface UpsertPacingRuleInput {
  id?: string;
  mealPeriod?: string | null;
  dayOfWeek?: number | null;
  intervalStartTime?: string | null;
  intervalEndTime?: string | null;
  maxCovers: number;
  maxReservations?: number | null;
  minPartySize?: number | null;
  priority?: number;
  isActive?: boolean;
  clientRequestId?: string;
}

export async function upsertPacingRule(
  ctx: RequestContext,
  input: UpsertPacingRuleInput,
): Promise<Record<string, unknown>> {
  // locationId is required for pacing rules — an empty locationId would create
  // a rule that silently applies to all locations or matches nothing, which is
  // a data integrity hazard.
  if (!ctx.locationId) {
    throw new AppError('VALIDATION_ERROR', 'locationId is required to upsert a pacing rule');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'upsertPacingRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
    }

    let rule: Record<string, unknown>;
    let isNew: boolean;

    if (input.id) {
      // UPDATE path — verify the rule belongs to this tenant
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

      const [updated] = await (tx as any)
        .update(fnbPacingRules)
        .set({
          ...(input.mealPeriod !== undefined && { mealPeriod: input.mealPeriod }),
          ...(input.dayOfWeek !== undefined && { dayOfWeek: input.dayOfWeek }),
          ...(input.intervalStartTime !== undefined && { intervalStartTime: input.intervalStartTime }),
          ...(input.intervalEndTime !== undefined && { intervalEndTime: input.intervalEndTime }),
          ...(input.maxCovers !== undefined && { maxCovers: input.maxCovers }),
          ...(input.maxReservations !== undefined && { maxReservations: input.maxReservations }),
          ...(input.minPartySize !== undefined && { minPartySize: input.minPartySize }),
          ...(input.priority !== undefined && { priority: input.priority }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(fnbPacingRules.id, input.id),
            eq(fnbPacingRules.tenantId, ctx.tenantId),
          ),
        )
        .returning();

      rule = updated! as Record<string, unknown>;
      isNew = false;
    } else {
      // INSERT path
      const [created] = await (tx as any)
        .insert(fnbPacingRules)
        .values({
          tenantId: ctx.tenantId,
          locationId: ctx.locationId,
          mealPeriod: input.mealPeriod ?? null,
          dayOfWeek: input.dayOfWeek ?? null,
          intervalStartTime: input.intervalStartTime ?? null,
          intervalEndTime: input.intervalEndTime ?? null,
          maxCovers: input.maxCovers,
          maxReservations: input.maxReservations ?? null,
          minPartySize: input.minPartySize ?? null,
          priority: input.priority ?? 0,
          isActive: input.isActive ?? true,
          createdBy: ctx.user.id,
        })
        .returning();

      rule = created! as Record<string, unknown>;
      isNew = true;
    }

    const event = buildEventFromContext(ctx, HOST_EVENTS.PACING_RULE_UPDATED, {
      ruleId: rule.id,
      locationId: rule.locationId,
      isNew,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertPacingRule', rule);

    return { result: rule, events: [event] };
  });

  await auditLog(
    ctx,
    'fnb.pacing.rule_upserted',
    'fnb_pacing_rules',
    String((result as any).id),
  );

  return result as Record<string, unknown>;
}
