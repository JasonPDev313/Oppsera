import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItems, taxGroups, catalogItemLocationTaxGroups } from '../schema';
import { locations } from '@oppsera/db';
import type { AssignItemTaxGroupsInput } from '../validation-taxes';

export async function assignItemTaxGroups(
  ctx: RequestContext,
  input: AssignItemTaxGroupsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify item exists and belongs to tenant
    const [item] = await tx
      .select()
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.id, input.catalogItemId),
          eq(catalogItems.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!item) {
      throw new NotFoundError('Catalog item', input.catalogItemId);
    }

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

    // Validate tax groups exist, belong to tenant+location, and are active
    if (input.taxGroupIds.length > 0) {
      const groups = await tx
        .select()
        .from(taxGroups)
        .where(
          and(
            eq(taxGroups.tenantId, ctx.tenantId),
            eq(taxGroups.locationId, input.locationId),
            inArray(taxGroups.id, input.taxGroupIds),
            eq(taxGroups.isActive, true),
          ),
        );

      if (groups.length !== input.taxGroupIds.length) {
        throw new ValidationError(
          'One or more tax groups not found or inactive at this location',
        );
      }

      // V1 CONSTRAINT: All groups must share the same calculation mode
      const modes = new Set(groups.map((g) => g.calculationMode));
      if (modes.size > 1) {
        throw new ValidationError(
          'All tax groups assigned to an item at a location must use the same calculation mode (all exclusive or all inclusive)',
        );
      }
    }

    // Full replacement: delete existing, insert new
    await tx
      .delete(catalogItemLocationTaxGroups)
      .where(
        and(
          eq(catalogItemLocationTaxGroups.tenantId, ctx.tenantId),
          eq(catalogItemLocationTaxGroups.locationId, input.locationId),
          eq(catalogItemLocationTaxGroups.catalogItemId, input.catalogItemId),
        ),
      );

    for (const groupId of input.taxGroupIds) {
      await tx.insert(catalogItemLocationTaxGroups).values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        catalogItemId: input.catalogItemId,
        taxGroupId: groupId,
      });
    }

    const event = buildEventFromContext(ctx, 'catalog.item.tax_groups.updated.v1', {
      catalogItemId: input.catalogItemId,
      locationId: input.locationId,
      taxGroupIds: input.taxGroupIds,
    });

    return {
      result: {
        catalogItemId: input.catalogItemId,
        locationId: input.locationId,
        taxGroupIds: input.taxGroupIds,
      },
      events: [event],
    };
  });

  await auditLog(
    ctx,
    'catalog.item.tax_groups.updated',
    'catalog_item',
    input.catalogItemId,
  );

  return result;
}
