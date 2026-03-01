import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaPackageDefinitions } from '@oppsera/db';
import {
  createPackageDefinitionSchema,
  updatePackageDefinitionSchema,
} from '../validation';
import type {
  CreatePackageDefinitionInput,
  UpdatePackageDefinitionInput,
} from '../validation';

/**
 * Creates a new spa package definition.
 *
 * Validates input, checks idempotency, inserts the definition
 * with all fields, and records an audit log entry.
 */
export async function createPackageDefinition(ctx: RequestContext, input: CreatePackageDefinitionInput) {
  const parsed = createPackageDefinitionSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, parsed.clientRequestId, 'createPackageDefinition');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Insert package definition
    const [created] = await tx
      .insert(spaPackageDefinitions)
      .values({
        tenantId: ctx.tenantId,
        name: parsed.name,
        description: parsed.description ?? null,
        packageType: parsed.packageType,
        includedServices: parsed.includedServices ?? null,
        totalSessions: parsed.totalSessions ?? null,
        totalCredits: parsed.totalCredits ?? null,
        totalValueCents: parsed.totalValueCents ?? null,
        sellingPriceCents: parsed.sellingPriceCents,
        validityDays: parsed.validityDays,
        isTransferable: parsed.isTransferable,
        isShareable: parsed.isShareable,
        maxShares: parsed.maxShares,
        autoRenew: parsed.autoRenew,
        renewalPriceCents: parsed.renewalPriceCents ?? null,
        freezeAllowed: parsed.freezeAllowed,
        maxFreezeDays: parsed.maxFreezeDays ?? null,
        sortOrder: parsed.sortOrder,
      })
      .returning();

    // Save idempotency key
    await saveIdempotencyKey(tx, ctx.tenantId, parsed.clientRequestId, 'createPackageDefinition', created!);

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.package_definition.created', 'spa_package_definition', result.id);

  return result;
}

/**
 * Updates an existing spa package definition.
 *
 * Finds the definition, verifies it belongs to the tenant,
 * and applies only the fields that were provided.
 */
export async function updatePackageDefinition(ctx: RequestContext, input: UpdatePackageDefinitionInput) {
  const parsed = updatePackageDefinitionSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find existing definition
    const [existing] = await tx
      .select({ id: spaPackageDefinitions.id, tenantId: spaPackageDefinitions.tenantId })
      .from(spaPackageDefinitions)
      .where(
        and(
          eq(spaPackageDefinitions.tenantId, ctx.tenantId),
          eq(spaPackageDefinitions.id, parsed.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Package definition not found: ${parsed.id}`, 404);
    }

    // Build update fields — only set fields that were explicitly provided
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    if (parsed.name !== undefined) updateFields.name = parsed.name;
    if (parsed.description !== undefined) updateFields.description = parsed.description ?? null;
    if (parsed.packageType !== undefined) updateFields.packageType = parsed.packageType;
    if (parsed.includedServices !== undefined) updateFields.includedServices = parsed.includedServices ?? null;
    if (parsed.totalSessions !== undefined) updateFields.totalSessions = parsed.totalSessions ?? null;
    if (parsed.totalCredits !== undefined) updateFields.totalCredits = parsed.totalCredits ?? null;
    if (parsed.totalValueCents !== undefined) updateFields.totalValueCents = parsed.totalValueCents ?? null;
    if (parsed.sellingPriceCents !== undefined) updateFields.sellingPriceCents = parsed.sellingPriceCents;
    if (parsed.validityDays !== undefined) updateFields.validityDays = parsed.validityDays;
    if (parsed.isTransferable !== undefined) updateFields.isTransferable = parsed.isTransferable;
    if (parsed.isShareable !== undefined) updateFields.isShareable = parsed.isShareable;
    if (parsed.maxShares !== undefined) updateFields.maxShares = parsed.maxShares;
    if (parsed.autoRenew !== undefined) updateFields.autoRenew = parsed.autoRenew;
    if (parsed.renewalPriceCents !== undefined) updateFields.renewalPriceCents = parsed.renewalPriceCents ?? null;
    if (parsed.freezeAllowed !== undefined) updateFields.freezeAllowed = parsed.freezeAllowed;
    if (parsed.maxFreezeDays !== undefined) updateFields.maxFreezeDays = parsed.maxFreezeDays ?? null;
    if (parsed.sortOrder !== undefined) updateFields.sortOrder = parsed.sortOrder;

    const [updated] = await tx
      .update(spaPackageDefinitions)
      .set(updateFields)
      .where(eq(spaPackageDefinitions.id, parsed.id))
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.package_definition.updated', 'spa_package_definition', result.id);

  return result;
}

/**
 * Deactivates a spa package definition by setting isActive = false.
 *
 * Finds the definition, verifies it belongs to the tenant,
 * and soft-deactivates it.
 */
export async function deactivatePackageDefinition(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find existing definition
    const [existing] = await tx
      .select({
        id: spaPackageDefinitions.id,
        tenantId: spaPackageDefinitions.tenantId,
        isActive: spaPackageDefinitions.isActive,
      })
      .from(spaPackageDefinitions)
      .where(
        and(
          eq(spaPackageDefinitions.tenantId, ctx.tenantId),
          eq(spaPackageDefinitions.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Package definition not found: ${input.id}`, 404);
    }

    if (!existing.isActive) {
      throw new AppError('VALIDATION_ERROR', 'Package definition is already deactivated', 400);
    }

    const [deactivated] = await tx
      .update(spaPackageDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(spaPackageDefinitions.id, input.id))
      .returning();

    return { result: deactivated!, events: [] };
  });

  await auditLog(ctx, 'spa.package_definition.deactivated', 'spa_package_definition', result.id);

  return result;
}
