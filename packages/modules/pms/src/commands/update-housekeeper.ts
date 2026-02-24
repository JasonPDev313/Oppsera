/**
 * Update a housekeeper.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsHousekeepers } from '@oppsera/db';
import type { UpdateHousekeeperInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateHousekeeper(
  ctx: RequestContext,
  housekeeperId: string,
  input: UpdateHousekeeperInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsHousekeepers)
      .where(and(eq(pmsHousekeepers.id, housekeeperId), eq(pmsHousekeepers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Housekeeper', housekeeperId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await tx
      .update(pmsHousekeepers)
      .set(updates)
      .where(eq(pmsHousekeepers.id, housekeeperId));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'housekeeper', housekeeperId, 'updated', updates);

    return { result: { id: housekeeperId }, events: [] };
  });

  await auditLog(ctx, 'pms.housekeeper.updated', 'pms_housekeeper', result.id);
  return result;
}
