/**
 * Create a housekeeper for a property.
 * Requires a linked user account (userId is mandatory).
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ConflictError } from '@oppsera/shared';
import { pmsHousekeepers, pmsProperties, users } from '@oppsera/db';
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

    // Validate user exists in tenant
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, ctx.tenantId)))
      .limit(1);
    if (!user) throw new NotFoundError('User', input.userId);

    // Check for duplicate — same user already a housekeeper at this property
    const [existing] = await tx
      .select({ id: pmsHousekeepers.id })
      .from(pmsHousekeepers)
      .where(
        and(
          eq(pmsHousekeepers.tenantId, ctx.tenantId),
          eq(pmsHousekeepers.propertyId, input.propertyId),
          eq(pmsHousekeepers.userId, input.userId),
        ),
      )
      .limit(1);
    if (existing) throw new ConflictError('This user is already a housekeeper at this property');

    const id = generateUlid();
    await tx.insert(pmsHousekeepers).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      userId: input.userId,
      name: input.name,
      phone: input.phone ?? null,
    });

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'housekeeper', id, 'created', {
      name: input.name,
      userId: input.userId,
    });

    return { result: { id }, events: [] };
  });

  await auditLog(ctx, 'pms.housekeeper.created', 'pms_housekeeper', result.id);
  return result;
}
