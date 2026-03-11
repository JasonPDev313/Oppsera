import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbCourseRules } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { DeleteCourseRuleInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

/**
 * Delete a course rule by ID.
 * The item/scope falls back to inheriting from its parent in the hierarchy.
 */
export async function deleteCourseRule(
  ctx: RequestContext,
  input: DeleteCourseRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'deleteCourseRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
    }

    const [rule] = await tx
      .select()
      .from(fnbCourseRules)
      .where(and(
        eq(fnbCourseRules.id, input.ruleId),
        eq(fnbCourseRules.tenantId, ctx.tenantId),
      ))
      .limit(1);

    if (!rule) {
      // Idempotent — already deleted or never existed
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'deleteCourseRule', { deleted: false });
      return { result: { deleted: false }, events: [] };
    }

    await tx
      .delete(fnbCourseRules)
      .where(eq(fnbCourseRules.id, input.ruleId));

    const event = buildEventFromContext(ctx, FNB_EVENTS.COURSE_RULE_DELETED, {
      ruleId: rule.id,
      scopeType: rule.scopeType,
      scopeId: rule.scopeId,
      locationId: rule.locationId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'deleteCourseRule', { deleted: true });

    return { result: { deleted: true, rule }, events: [event] };
  });

  logger.info('[fnb] course rule deleted', {
    domain: 'fnb', tenantId: ctx.tenantId,
    ruleId: input.ruleId, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.course_rule.deleted', 'fnb_course_rules', input.ruleId);
  return result;
}
