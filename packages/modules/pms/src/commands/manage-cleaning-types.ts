/**
 * CRUD operations for cleaning types (service levels).
 *
 * Note: These are low-frequency configuration operations — publishWithOutbox
 * is intentionally omitted. auditLogDeferred() provides an audit trail.
 * If downstream systems ever need to react to cleaning type changes, promote
 * to publishWithOutbox and emit pms.cleaning_type.* events.
 */
import { and, eq } from 'drizzle-orm';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsCleaningTypes, pmsProperties } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import type { CreateCleaningTypeInput, UpdateCleaningTypeInput } from '../validation';

export async function createCleaningType(ctx: RequestContext, input: CreateCleaningTypeInput) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    const id = generateUlid();
    const now = new Date();
    await tx.insert(pmsCleaningTypes).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });

    auditLogDeferred(ctx, 'pms.cleaning_type.created', 'pms_cleaning_types', id);
    return { id, code: input.code, name: input.name };
  });
}

export async function updateCleaningType(
  ctx: RequestContext,
  cleaningTypeId: string,
  input: UpdateCleaningTypeInput,
) {
  return withTenant(ctx.tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsCleaningTypes)
      .where(and(eq(pmsCleaningTypes.id, cleaningTypeId), eq(pmsCleaningTypes.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('CleaningType', cleaningTypeId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.estimatedMinutes !== undefined) updates.estimatedMinutes = input.estimatedMinutes;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await tx
      .update(pmsCleaningTypes)
      .set(updates)
      .where(and(eq(pmsCleaningTypes.id, cleaningTypeId), eq(pmsCleaningTypes.tenantId, ctx.tenantId)));

    auditLogDeferred(ctx, 'pms.cleaning_type.updated', 'pms_cleaning_types', cleaningTypeId);
    return { id: cleaningTypeId };
  });
}
