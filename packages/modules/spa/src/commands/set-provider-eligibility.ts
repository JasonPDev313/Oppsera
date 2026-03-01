import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaProviders, spaProviderServiceEligibility, spaServices } from '@oppsera/db';
import type { SetProviderServiceEligibilityInput } from '../validation';

/**
 * Sets (replaces) the service eligibility for a provider.
 * Deletes all existing eligibility rows and inserts new ones.
 * This is a config change — no domain events.
 */
export async function setProviderEligibility(
  ctx: RequestContext,
  input: SetProviderServiceEligibilityInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate provider exists and belongs to tenant
    const [provider] = await tx
      .select({ id: spaProviders.id })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.id, input.providerId),
          eq(spaProviders.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!provider) {
      throw new AppError('NOT_FOUND', `Provider not found: ${input.providerId}`, 404);
    }

    // Validate all serviceIds exist and belong to tenant
    if (input.eligibilities.length > 0) {
      const serviceIds = input.eligibilities.map((e) => e.serviceId);
      const uniqueServiceIds = [...new Set(serviceIds)];

      if (uniqueServiceIds.length !== serviceIds.length) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Duplicate serviceIds found in eligibilities list',
          400,
        );
      }

      const existingServices = await tx
        .select({ id: spaServices.id })
        .from(spaServices)
        .where(
          and(
            eq(spaServices.tenantId, ctx.tenantId),
            inArray(spaServices.id, uniqueServiceIds),
          ),
        );

      const foundIds = new Set(existingServices.map((s) => s.id));
      const missingIds = uniqueServiceIds.filter((id) => !foundIds.has(id));

      if (missingIds.length > 0) {
        throw new AppError(
          'NOT_FOUND',
          `Services not found: ${missingIds.join(', ')}`,
          404,
        );
      }
    }

    // Delete existing eligibility rows for this provider
    await tx
      .delete(spaProviderServiceEligibility)
      .where(
        and(
          eq(spaProviderServiceEligibility.tenantId, ctx.tenantId),
          eq(spaProviderServiceEligibility.providerId, input.providerId),
        ),
      );

    // Insert new eligibility rows
    if (input.eligibilities.length > 0) {
      const rows = input.eligibilities.map((e) => ({
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        serviceId: e.serviceId,
        proficiencyLevel: e.proficiencyLevel ?? 'standard',
        customDurationMinutes: e.customDurationMinutes ?? null,
        customPrice: e.customPrice ?? null,
      }));

      await tx.insert(spaProviderServiceEligibility).values(rows);
    }

    // No domain events for config changes
    return {
      result: { providerId: input.providerId, eligibilityCount: input.eligibilities.length },
      events: [],
    };
  });

  await auditLog(ctx, 'spa.provider.eligibility_set', 'spa_provider', input.providerId);
  return result;
}
