/**
 * Create a housekeeper for a property.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsHousekeepers, pmsProperties } from '@oppsera/db';
import type { CreateHousekeeperInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createHousekeeper(ctx: RequestContext, input: CreateHousekeeperInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    const id = generateUlid();
    await tx.insert(pmsHousekeepers).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      userId: input.userId ?? null,
      name: input.name,
      phone: input.phone ?? null,
    });

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'housekeeper', id, 'created', {
      name: input.name,
    });

    return { result: { id }, events: [] };
  });

  await auditLog(ctx, 'pms.housekeeper.created', 'pms_housekeeper', result.id);
  return result;
}
