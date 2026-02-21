import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbItemAllergens } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RemoveItemAllergenInput } from '../validation';

export async function removeItemAllergen(
  ctx: RequestContext,
  input: RemoveItemAllergenInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'removeItemAllergen',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const deleted = await (tx as any)
      .delete(fnbItemAllergens)
      .where(and(
        eq(fnbItemAllergens.tenantId, ctx.tenantId),
        eq(fnbItemAllergens.catalogItemId, input.catalogItemId),
        eq(fnbItemAllergens.allergenId, input.allergenId),
      ))
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'removeItemAllergen', { removed: deleted.length > 0 });

    return { result: { removed: deleted.length > 0 }, events: [] };
  });

  await auditLog(ctx, 'fnb.allergen.removed', 'fnb_item_allergens', input.catalogItemId);
  return result;
}
