import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsRatePackages } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function deactivateRatePackage(
  ctx: RequestContext,
  ratePackageId: string,
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

    const [updated] = await tx
      .update(pmsRatePackages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(pmsRatePackages.id, ratePackageId), eq(pmsRatePackages.tenantId, ctx.tenantId)))
      .returning();

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'rate_package', ratePackageId, 'deactivated',
      { isActive: { before: existing.isActive, after: false } },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.RATE_PACKAGE_DEACTIVATED, {
      ratePackageId,
      propertyId: existing.propertyId,
      code: existing.code,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.rate_package.deactivated', 'pms_rate_package', ratePackageId);

  return result;
}
