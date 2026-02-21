import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbAllergenDefinitions } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateAllergenInput } from '../validation';

export async function createAllergen(
  ctx: RequestContext,
  input: CreateAllergenInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createAllergen',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [created] = await (tx as any)
      .insert(fnbAllergenDefinitions)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        icon: input.icon ?? null,
        severity: input.severity ?? 'standard',
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createAllergen', created);

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'fnb.allergen.created', 'fnb_allergen_definitions', result.id);
  return result;
}
