import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbItemAllergens, fnbAllergenDefinitions } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { TagItemAllergenInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { AllergenNotFoundError } from '../errors';

export async function tagItemAllergen(
  ctx: RequestContext,
  input: TagItemAllergenInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'tagItemAllergen',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate allergen exists
    const [allergen] = await (tx as any)
      .select()
      .from(fnbAllergenDefinitions)
      .where(and(
        eq(fnbAllergenDefinitions.id, input.allergenId),
        eq(fnbAllergenDefinitions.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!allergen) throw new AllergenNotFoundError(input.allergenId);

    const [created] = await (tx as any)
      .insert(fnbItemAllergens)
      .values({
        tenantId: ctx.tenantId,
        catalogItemId: input.catalogItemId,
        allergenId: input.allergenId,
        notes: input.notes ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.ALLERGEN_TAGGED, {
      catalogItemId: input.catalogItemId,
      allergenId: input.allergenId,
      allergenName: allergen.name,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'tagItemAllergen', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.allergen.tagged', 'fnb_item_allergens', result.id);
  return result;
}
