import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glClassifications } from '@oppsera/db';
import { generateUlid, ConflictError } from '@oppsera/shared';
import type { CreateGlClassificationInput } from '../validation';

export async function createGlClassification(
  ctx: RequestContext,
  input: CreateGlClassificationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate unique name per tenant
    const [existing] = await tx
      .select({ id: glClassifications.id })
      .from(glClassifications)
      .where(
        and(
          eq(glClassifications.tenantId, ctx.tenantId),
          eq(glClassifications.name, input.name),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        `Classification name '${input.name}' already exists for this tenant`,
      );
    }

    const [classification] = await tx
      .insert(glClassifications)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        name: input.name,
        accountType: input.accountType,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'accounting.classification.created.v1', {
      classificationId: classification!.id,
      name: input.name,
      accountType: input.accountType,
    });

    return { result: classification!, events: [event] };
  });

  await auditLog(ctx, 'accounting.classification.created', 'gl_classification', result.id);
  return result;
}
