import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { pmsRatePackages, pmsProperties, pmsRatePlans } from '@oppsera/db';
import type { CreateRatePackageInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createRatePackage(ctx: RequestContext, input: CreateRatePackageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'pms.createRatePackage');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

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
      .from(pmsRatePackages)
      .where(
        and(
          eq(pmsRatePackages.tenantId, ctx.tenantId),
          eq(pmsRatePackages.propertyId, input.propertyId),
          eq(pmsRatePackages.code, input.code),
        ),
      )
      .limit(1);

    if (existingCode) {
      throw new ConflictError(`Rate package with code "${input.code}" already exists for this property`);
    }

    // Validate ratePlanId if provided
    if (input.ratePlanId) {
      const [ratePlan] = await tx
        .select()
        .from(pmsRatePlans)
        .where(
          and(
            eq(pmsRatePlans.id, input.ratePlanId),
            eq(pmsRatePlans.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!ratePlan) {
        throw new NotFoundError('Rate plan', input.ratePlanId);
      }
    }

    const [created] = await tx
      .insert(pmsRatePackages)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        ratePlanId: input.ratePlanId ?? null,
        includesJson: input.includesJson ?? [],
        isActive: input.isActive ?? true,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'rate_package', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_PACKAGE_CREATED, {
      ratePackageId: created!.id,
      propertyId: input.propertyId,
      code: created!.code,
      name: created!.name,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pms.createRatePackage', created);
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.rate_package.created', 'pms_rate_package', result.id);

  return result;
}
