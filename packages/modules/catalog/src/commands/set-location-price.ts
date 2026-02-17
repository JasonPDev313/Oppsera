import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItems, catalogLocationPrices } from '../schema';
import { locations } from '@oppsera/db';
import type { SetLocationPriceInput } from '../validation';

export async function setLocationPrice(
  ctx: RequestContext,
  input: SetLocationPriceInput,
) {
  const locationPrice = await publishWithOutbox(ctx, async (tx) => {
    // Validate item exists and belongs to tenant
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

    // Validate location exists and belongs to tenant
    const [location] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.locationId),
          eq(locations.tenantId, ctx.tenantId),
          eq(locations.isActive, true),
        ),
      )
      .limit(1);

    if (!location) {
      throw new NotFoundError('Location', input.locationId);
    }

    // Check for existing override
    const [existing] = await tx
      .select()
      .from(catalogLocationPrices)
      .where(
        and(
          eq(catalogLocationPrices.catalogItemId, input.catalogItemId),
          eq(catalogLocationPrices.locationId, input.locationId),
        ),
      )
      .limit(1);

    const previousPrice = existing ? Number(existing.price) : null;
    let result;

    if (existing) {
      // Update existing override
      const [updated] = await tx
        .update(catalogLocationPrices)
        .set({ price: String(input.price) })
        .where(eq(catalogLocationPrices.id, existing.id))
        .returning();
      result = updated!;
    } else {
      // Insert new override
      const [created] = await tx
        .insert(catalogLocationPrices)
        .values({
          tenantId: ctx.tenantId,
          catalogItemId: input.catalogItemId,
          locationId: input.locationId,
          price: String(input.price),
        })
        .returning();
      result = created!;
    }

    const event = buildEventFromContext(ctx, 'catalog.location_price.set.v1', {
      catalogItemId: input.catalogItemId,
      locationId: input.locationId,
      price: input.price,
      previousPrice,
    });

    return { result, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.location_price.set',
    'catalog_location_price',
    locationPrice.id,
  );

  return locationPrice;
}
