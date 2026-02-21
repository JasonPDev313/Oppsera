import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glClassifications } from '@oppsera/db';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import type { UpdateGlClassificationInput } from '../validation';

export async function updateGlClassification(
  ctx: RequestContext,
  classificationId: string,
  input: UpdateGlClassificationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load existing
    const [existing] = await tx
      .select()
      .from(glClassifications)
      .where(
        and(
          eq(glClassifications.id, classificationId),
          eq(glClassifications.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('GL Classification', classificationId);
    }

    // 2. Validate unique name if changing
    if (input.name !== undefined && input.name !== existing.name) {
      const [dupe] = await tx
        .select({ id: glClassifications.id })
        .from(glClassifications)
        .where(
          and(
            eq(glClassifications.tenantId, ctx.tenantId),
            eq(glClassifications.name, input.name),
          ),
        )
        .limit(1);

      if (dupe) {
        throw new ConflictError(
          `Classification name '${input.name}' already exists for this tenant`,
        );
      }
    }

    // 3. Build update values
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateValues[key] = value;
      }
    }

    const [updated] = await tx
      .update(glClassifications)
      .set(updateValues)
      .where(eq(glClassifications.id, classificationId))
      .returning();

    const event = buildEventFromContext(ctx, 'accounting.classification.updated.v1', {
      classificationId,
      changes: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.classification.updated', 'gl_classification', result.id);
  return result;
}
