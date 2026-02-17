import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogLocationPrices } from '../schema';
import type { RemoveLocationPriceInput } from '../validation';

export async function removeLocationPrice(
  ctx: RequestContext,
  input: RemoveLocationPriceInput,
) {
  await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(catalogLocationPrices)
      .where(
        and(
          eq(catalogLocationPrices.catalogItemId, input.catalogItemId),
          eq(catalogLocationPrices.locationId, input.locationId),
          eq(catalogLocationPrices.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    // Idempotent: if it doesn't exist, no-op
    if (!existing) {
      return { result: undefined, events: [] };
    }

    await tx
      .delete(catalogLocationPrices)
      .where(eq(catalogLocationPrices.id, existing.id));

    const event = buildEventFromContext(ctx, 'catalog.location_price.removed.v1', {
      catalogItemId: input.catalogItemId,
      locationId: input.locationId,
    });

    return { result: undefined, events: [event] };
  });

  await auditLog(
    ctx,
    'catalog.location_price.removed',
    'catalog_location_price',
    `${input.catalogItemId}:${input.locationId}`,
  );
}
