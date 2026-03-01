import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaCommissionRules, spaProviders, spaServices } from '@oppsera/db';
import {
  createCommissionRuleSchema,
  updateCommissionRuleSchema,
} from '../validation';
import type {
  CreateCommissionRuleInput,
  UpdateCommissionRuleInput,
} from '../validation';

/**
 * Creates a new commission rule for spa providers.
 *
 * Validates provider and service references if specified,
 * inserts the rule, and records an audit log entry.
 */
export async function createCommissionRule(ctx: RequestContext, input: CreateCommissionRuleInput) {
  const parsed = createCommissionRuleSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, parsed.clientRequestId, 'createCommissionRule');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate provider exists if specified
    if (parsed.providerId) {
      const [provider] = await tx
        .select({ id: spaProviders.id, isActive: spaProviders.isActive })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, ctx.tenantId),
            eq(spaProviders.id, parsed.providerId),
          ),
        )
        .limit(1);

      if (!provider) {
        throw new AppError('NOT_FOUND', `Provider not found: ${parsed.providerId}`, 404);
      }
      if (!provider.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Provider is not active', 400);
      }
    }

    // Validate service exists if specified
    if (parsed.serviceId) {
      const [service] = await tx
        .select({ id: spaServices.id, isActive: spaServices.isActive })
        .from(spaServices)
        .where(
          and(
            eq(spaServices.tenantId, ctx.tenantId),
            eq(spaServices.id, parsed.serviceId),
          ),
        )
        .limit(1);

      if (!service) {
        throw new AppError('NOT_FOUND', `Service not found: ${parsed.serviceId}`, 404);
      }
      if (!service.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Service is not active', 400);
      }
    }

    // Insert commission rule
    const [created] = await tx
      .insert(spaCommissionRules)
      .values({
        tenantId: ctx.tenantId,
        name: parsed.name,
        providerId: parsed.providerId ?? null,
        serviceId: parsed.serviceId ?? null,
        serviceCategory: parsed.serviceCategory ?? null,
        commissionType: parsed.commissionType,
        rate: parsed.rate != null ? String(parsed.rate) : null,
        flatAmount: parsed.flatAmount ?? null,
        tiers: parsed.tiers ?? null,
        appliesTo: parsed.appliesTo,
        effectiveFrom: parsed.effectiveFrom,
        effectiveUntil: parsed.effectiveUntil ?? null,
        priority: parsed.priority,
      })
      .returning();

    // Save idempotency key
    await saveIdempotencyKey(tx, ctx.tenantId, parsed.clientRequestId, 'createCommissionRule', created!);

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'spa.commission_rule.created', 'spa_commission_rule', result.id);

  return result;
}

/**
 * Updates an existing commission rule.
 *
 * Finds the rule, verifies it belongs to the tenant,
 * and applies only the fields that were provided.
 */
export async function updateCommissionRule(ctx: RequestContext, input: UpdateCommissionRuleInput) {
  const parsed = updateCommissionRuleSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find existing rule
    const [existing] = await tx
      .select({ id: spaCommissionRules.id, tenantId: spaCommissionRules.tenantId })
      .from(spaCommissionRules)
      .where(
        and(
          eq(spaCommissionRules.tenantId, ctx.tenantId),
          eq(spaCommissionRules.id, parsed.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Commission rule not found: ${parsed.id}`, 404);
    }

    // Validate provider if being changed
    if (parsed.providerId) {
      const [provider] = await tx
        .select({ id: spaProviders.id, isActive: spaProviders.isActive })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, ctx.tenantId),
            eq(spaProviders.id, parsed.providerId),
          ),
        )
        .limit(1);

      if (!provider) {
        throw new AppError('NOT_FOUND', `Provider not found: ${parsed.providerId}`, 404);
      }
      if (!provider.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Provider is not active', 400);
      }
    }

    // Validate service if being changed
    if (parsed.serviceId) {
      const [service] = await tx
        .select({ id: spaServices.id, isActive: spaServices.isActive })
        .from(spaServices)
        .where(
          and(
            eq(spaServices.tenantId, ctx.tenantId),
            eq(spaServices.id, parsed.serviceId),
          ),
        )
        .limit(1);

      if (!service) {
        throw new AppError('NOT_FOUND', `Service not found: ${parsed.serviceId}`, 404);
      }
      if (!service.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Service is not active', 400);
      }
    }

    // Build update fields — only set fields that were explicitly provided
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    if (parsed.name !== undefined) updateFields.name = parsed.name;
    if (parsed.providerId !== undefined) updateFields.providerId = parsed.providerId ?? null;
    if (parsed.serviceId !== undefined) updateFields.serviceId = parsed.serviceId ?? null;
    if (parsed.serviceCategory !== undefined) updateFields.serviceCategory = parsed.serviceCategory ?? null;
    if (parsed.commissionType !== undefined) updateFields.commissionType = parsed.commissionType;
    if (parsed.rate !== undefined) updateFields.rate = parsed.rate != null ? String(parsed.rate) : null;
    if (parsed.flatAmount !== undefined) updateFields.flatAmount = parsed.flatAmount ?? null;
    if (parsed.tiers !== undefined) updateFields.tiers = parsed.tiers ?? null;
    if (parsed.appliesTo !== undefined) updateFields.appliesTo = parsed.appliesTo;
    if (parsed.effectiveFrom !== undefined) updateFields.effectiveFrom = parsed.effectiveFrom;
    if (parsed.effectiveUntil !== undefined) updateFields.effectiveUntil = parsed.effectiveUntil ?? null;
    if (parsed.priority !== undefined) updateFields.priority = parsed.priority;

    const [updated] = await tx
      .update(spaCommissionRules)
      .set(updateFields)
      .where(eq(spaCommissionRules.id, parsed.id))
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.commission_rule.updated', 'spa_commission_rule', result.id);

  return result;
}

/**
 * Deactivates a commission rule by setting isActive = false.
 *
 * Finds the rule, verifies it belongs to the tenant,
 * and soft-deactivates it.
 */
export async function deactivateCommissionRule(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find existing rule
    const [existing] = await tx
      .select({ id: spaCommissionRules.id, tenantId: spaCommissionRules.tenantId, isActive: spaCommissionRules.isActive })
      .from(spaCommissionRules)
      .where(
        and(
          eq(spaCommissionRules.tenantId, ctx.tenantId),
          eq(spaCommissionRules.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Commission rule not found: ${input.id}`, 404);
    }

    if (!existing.isActive) {
      throw new AppError('VALIDATION_ERROR', 'Commission rule is already deactivated', 400);
    }

    const [deactivated] = await tx
      .update(spaCommissionRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(spaCommissionRules.id, input.id))
      .returning();

    return { result: deactivated!, events: [] };
  });

  await auditLog(ctx, 'spa.commission_rule.deactivated', 'spa_commission_rule', result.id);

  return result;
}
