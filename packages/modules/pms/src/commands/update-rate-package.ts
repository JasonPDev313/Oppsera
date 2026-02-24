import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsRatePackages, pmsRatePlans } from '@oppsera/db';
import type { UpdateRatePackageInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateRatePackage(
  ctx: RequestContext,
  ratePackageId: string,
  input: UpdateRatePackageInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing rate package
    const [existing] = await tx
      .select()
      .from(pmsRatePackages)
      .where(
        and(
          eq(pmsRatePackages.id, ratePackageId),
          eq(pmsRatePackages.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Rate package', ratePackageId);
    }

    // Validate ratePlanId if provided
    if (input.ratePlanId !== undefined && input.ratePlanId !== null) {
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

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.ratePlanId !== undefined) updates.ratePlanId = input.ratePlanId;
    if (input.includesJson !== undefined) updates.includesJson = input.includesJson;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(pmsRatePackages)
      .set(updates)
      .where(and(eq(pmsRatePackages.id, ratePackageId), eq(pmsRatePackages.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.name !== undefined && existing.name !== updated!.name) {
      diff.name = { before: existing.name, after: updated!.name };
    }
    if (input.description !== undefined && existing.description !== updated!.description) {
      diff.description = { before: existing.description, after: updated!.description };
    }
    if (input.ratePlanId !== undefined && existing.ratePlanId !== updated!.ratePlanId) {
      diff.ratePlanId = { before: existing.ratePlanId, after: updated!.ratePlanId };
    }
    if (input.includesJson !== undefined) {
      diff.includesJson = { before: existing.includesJson, after: updated!.includesJson };
    }
    if (input.isActive !== undefined && existing.isActive !== updated!.isActive) {
      diff.isActive = { before: existing.isActive, after: updated!.isActive };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'rate_package', ratePackageId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_PACKAGE_UPDATED, {
      ratePackageId,
      propertyId: existing.propertyId,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.rate_package.updated', 'pms_rate_package', ratePackageId);

  return result;
}
