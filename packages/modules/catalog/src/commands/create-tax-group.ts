import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { ConflictError, NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxGroups, taxGroupRates, taxRates } from '../schema';
import { locations } from '@oppsera/db';
import type { CreateTaxGroupInput } from '../validation-taxes';

export async function createTaxGroup(ctx: RequestContext, input: CreateTaxGroupInput) {
  const group = await publishWithOutbox(ctx, async (tx) => {
    // Verify location belongs to tenant
    const [loc] = await tx
      .select()
      .from(locations)
      .where(
        and(eq(locations.id, input.locationId), eq(locations.tenantId, ctx.tenantId)),
      )
      .limit(1);

    if (!loc) {
      throw new NotFoundError('Location', input.locationId);
    }

    // Check uniqueness: name within (tenant, location)
    const existing = await tx
      .select()
      .from(taxGroups)
      .where(
        and(
          eq(taxGroups.tenantId, ctx.tenantId),
          eq(taxGroups.locationId, input.locationId),
          eq(taxGroups.name, input.name),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(
        `Tax group "${input.name}" already exists at this location`,
      );
    }

    // Verify all tax rates exist and belong to tenant
    const rates = await tx
      .select()
      .from(taxRates)
      .where(
        and(
          inArray(taxRates.id, input.taxRateIds),
          eq(taxRates.tenantId, ctx.tenantId),
        ),
      );

    if (rates.length !== input.taxRateIds.length) {
      throw new NotFoundError('Tax rate');
    }

    // Insert group
    const [created] = await tx
      .insert(taxGroups)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        name: input.name,
        calculationMode: input.calculationMode,
        createdBy: ctx.user.id,
      })
      .returning();

    // Insert group rate associations
    for (let i = 0; i < input.taxRateIds.length; i++) {
      await tx.insert(taxGroupRates).values({
        tenantId: ctx.tenantId,
        taxGroupId: created!.id,
        taxRateId: input.taxRateIds[i]!,
        sortOrder: i,
      });
    }

    const event = buildEventFromContext(ctx, 'tax.group.created.v1', {
      taxGroupId: created!.id,
      locationId: input.locationId,
      name: input.name,
      calculationMode: input.calculationMode,
      taxRateIds: input.taxRateIds,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'tax.group.created', 'tax_group', group.id);
  return group;
}
