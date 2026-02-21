import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { pmsProperties, pmsRatePlans } from '@oppsera/db';
import type { CreateRatePlanInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createRatePlan(ctx: RequestContext, input: CreateRatePlanInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate property exists and belongs to tenant
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, input.propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundError('Property', input.propertyId);
    }

    // Validate code uniqueness within property
    const [existingCode] = await tx
      .select()
      .from(pmsRatePlans)
      .where(
        and(
          eq(pmsRatePlans.tenantId, ctx.tenantId),
          eq(pmsRatePlans.propertyId, input.propertyId),
          eq(pmsRatePlans.code, input.code),
        ),
      )
      .limit(1);

    if (existingCode) {
      throw new ConflictError(`Rate plan with code "${input.code}" already exists for this property`);
    }

    // If isDefault=true, unset any existing default rate plan for this property
    const isDefault = input.isDefault ?? false;
    if (isDefault) {
      await tx
        .update(pmsRatePlans)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(pmsRatePlans.tenantId, ctx.tenantId),
            eq(pmsRatePlans.propertyId, input.propertyId),
            eq(pmsRatePlans.isDefault, true),
          ),
        );
    }

    const [created] = await tx
      .insert(pmsRatePlans)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        isDefault,
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'rate_plan', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_PLAN_CREATED, {
      ratePlanId: created!.id,
      propertyId: input.propertyId,
      code: created!.code,
      name: created!.name,
      isDefault: created!.isDefault,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.rate_plan.created', 'pms_rate_plan', result.id);

  return result;
}
