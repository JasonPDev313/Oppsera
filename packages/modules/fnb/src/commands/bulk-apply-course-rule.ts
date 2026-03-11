import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbCourseRules } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BulkApplyCourseRuleInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export interface BulkApplyCourseRuleResult {
  ruleId: string;
  scopeType: string;
  scopeId: string;
  itemOverridesCleared: number;
}

/**
 * Apply a course rule at a hierarchy scope (department, sub_department, or category).
 * Optionally clears item-level overrides under that scope.
 */
export async function bulkApplyCourseRule(
  ctx: RequestContext,
  input: BulkApplyCourseRuleInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'Location header is required for course rule operations', 400);
  }
  const locationId = ctx.locationId;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bulkApplyCourseRule',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
    }

    // Upsert the rule at the given scope
    const [existing] = await tx
      .select()
      .from(fnbCourseRules)
      .where(and(
        eq(fnbCourseRules.tenantId, ctx.tenantId),
        eq(fnbCourseRules.locationId, locationId),
        eq(fnbCourseRules.scopeType, input.scopeType),
        eq(fnbCourseRules.scopeId, input.scopeId),
      ))
      .limit(1);

    const now = new Date();
    let rule: typeof fnbCourseRules.$inferSelect;

    if (existing) {
      const updated = await tx
        .update(fnbCourseRules)
        .set({
          defaultCourseNumber: input.defaultCourseNumber,
          allowedCourseNumbers: input.allowedCourseNumbers,
          lockCourse: input.lockCourse,
          updatedAt: now,
          updatedBy: ctx.user.id,
        })
        .where(eq(fnbCourseRules.id, existing.id))
        .returning();
      rule = updated[0]!;
    } else {
      const inserted = await tx
        .insert(fnbCourseRules)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          locationId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          defaultCourseNumber: input.defaultCourseNumber,
          allowedCourseNumbers: input.allowedCourseNumbers,
          lockCourse: input.lockCourse,
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning();
      rule = inserted[0]!;
    }

    // Optionally clear item-level overrides under this scope
    let itemOverridesCleared = 0;
    if (input.overrideItemRules) {
      // Find all item IDs that fall under this scope, then delete their rules
      let deleteQuery: ReturnType<typeof sql>;

      if (input.scopeType === 'category') {
        // Items directly in this category
        deleteQuery = sql`
          DELETE FROM fnb_course_rules
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${locationId}
            AND scope_type = 'item'
            AND scope_id IN (
              SELECT id FROM catalog_items
              WHERE tenant_id = ${ctx.tenantId}
                AND category_id = ${input.scopeId}
            )`;
      } else if (input.scopeType === 'sub_department') {
        // Items in categories under this sub-department
        deleteQuery = sql`
          DELETE FROM fnb_course_rules
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${locationId}
            AND scope_type = 'item'
            AND scope_id IN (
              SELECT ci.id FROM catalog_items ci
              JOIN catalog_categories cc ON cc.id = ci.category_id
                AND cc.tenant_id = ${ctx.tenantId}
              WHERE ci.tenant_id = ${ctx.tenantId}
                AND (cc.id = ${input.scopeId} OR cc.parent_id = ${input.scopeId})
            )`;
      } else {
        // department — items in sub-depts under this department
        deleteQuery = sql`
          DELETE FROM fnb_course_rules
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${locationId}
            AND scope_type = 'item'
            AND scope_id IN (
              SELECT ci.id FROM catalog_items ci
              JOIN catalog_categories c1 ON c1.id = ci.category_id
                AND c1.tenant_id = ${ctx.tenantId}
              LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
                AND c2.tenant_id = ${ctx.tenantId}
              WHERE ci.tenant_id = ${ctx.tenantId}
                AND (c1.id = ${input.scopeId} OR c1.parent_id = ${input.scopeId}
                     OR c2.id = ${input.scopeId} OR c2.parent_id = ${input.scopeId})
            )`;
      }

      const deleteResult = await tx.execute(deleteQuery);
      itemOverridesCleared = Number((deleteResult as unknown as { rowCount?: number }).rowCount ?? 0);
    }

    const bulkResult: BulkApplyCourseRuleResult = {
      ruleId: rule.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      itemOverridesCleared,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.COURSE_RULE_BULK_APPLIED, {
      ruleId: rule.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      locationId,
      itemOverridesCleared,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bulkApplyCourseRule', bulkResult);

    return { result: bulkResult as unknown as Record<string, unknown>, events: [event] };
  });

  const typedResult = result as unknown as BulkApplyCourseRuleResult;

  logger.info('[fnb] course rule bulk applied', {
    domain: 'fnb', tenantId: ctx.tenantId, locationId,
    scopeType: input.scopeType, scopeId: input.scopeId,
    itemOverridesCleared: typedResult.itemOverridesCleared,
    userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.course_rule.bulk_applied', 'fnb_course_rules', typedResult.ruleId);
  return typedResult;
}
