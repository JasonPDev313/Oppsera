import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, discountGlMappings } from '@oppsera/db';
import { NotFoundError, DISCOUNT_CLASSIFICATION_KEYS } from '@oppsera/shared';

export interface SaveDiscountGlMappingInput {
  subDepartmentId: string;
  classification: string;
  glAccountId: string;
}

export interface SaveDiscountGlMappingsBatchInput {
  mappings: SaveDiscountGlMappingInput[];
}

/**
 * Upsert a single discount GL mapping.
 */
export async function saveDiscountGlMapping(
  ctx: RequestContext,
  input: SaveDiscountGlMappingInput,
) {
  if (!DISCOUNT_CLASSIFICATION_KEYS.includes(input.classification)) {
    throw new NotFoundError('Discount Classification', input.classification);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate GL account exists
    const [account] = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.tenantId, ctx.tenantId),
          eq(glAccounts.id, input.glAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('GL Account', input.glAccountId);
    }

    // Upsert
    const existing = await tx
      .select()
      .from(discountGlMappings)
      .where(
        and(
          eq(discountGlMappings.tenantId, ctx.tenantId),
          eq(discountGlMappings.subDepartmentId, input.subDepartmentId),
          eq(discountGlMappings.discountClassification, input.classification),
        ),
      )
      .limit(1);

    let mapping;
    if (existing.length > 0) {
      [mapping] = await tx
        .update(discountGlMappings)
        .set({ glAccountId: input.glAccountId })
        .where(
          and(
            eq(discountGlMappings.tenantId, ctx.tenantId),
            eq(discountGlMappings.subDepartmentId, input.subDepartmentId),
            eq(discountGlMappings.discountClassification, input.classification),
          ),
        )
        .returning();
    } else {
      [mapping] = await tx
        .insert(discountGlMappings)
        .values({
          tenantId: ctx.tenantId,
          subDepartmentId: input.subDepartmentId,
          discountClassification: input.classification,
          glAccountId: input.glAccountId,
        })
        .returning();
    }

    const event = buildEventFromContext(ctx, 'accounting.discount_gl_mapping.saved.v1', {
      subDepartmentId: input.subDepartmentId,
      classification: input.classification,
      glAccountId: input.glAccountId,
    });

    return { result: mapping!, events: [event] };
  });

  await auditLog(ctx, 'accounting.discount_gl_mapping.saved', 'discount_gl_mappings', `${input.subDepartmentId}:${input.classification}`);
  return result;
}

/**
 * Batch upsert discount GL mappings.
 */
export async function saveDiscountGlMappingsBatch(
  ctx: RequestContext,
  input: SaveDiscountGlMappingsBatchInput,
) {
  // Validate all classifications
  for (const m of input.mappings) {
    if (!DISCOUNT_CLASSIFICATION_KEYS.includes(m.classification)) {
      throw new NotFoundError('Discount Classification', m.classification);
    }
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate all GL account IDs exist in one query
    const uniqueAccountIds = [...new Set(input.mappings.map(m => m.glAccountId))];
    if (uniqueAccountIds.length > 0) {
      const accounts = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            inArray(glAccounts.id, uniqueAccountIds),
          ),
        );

      const foundIds = new Set(accounts.map(a => a.id));
      for (const id of uniqueAccountIds) {
        if (!foundIds.has(id)) {
          throw new NotFoundError('GL Account', id);
        }
      }
    }

    // Upsert each mapping
    const results = [];
    for (const m of input.mappings) {
      const existing = await tx
        .select()
        .from(discountGlMappings)
        .where(
          and(
            eq(discountGlMappings.tenantId, ctx.tenantId),
            eq(discountGlMappings.subDepartmentId, m.subDepartmentId),
            eq(discountGlMappings.discountClassification, m.classification),
          ),
        )
        .limit(1);

      let mapping;
      if (existing.length > 0) {
        [mapping] = await tx
          .update(discountGlMappings)
          .set({ glAccountId: m.glAccountId })
          .where(
            and(
              eq(discountGlMappings.tenantId, ctx.tenantId),
              eq(discountGlMappings.subDepartmentId, m.subDepartmentId),
              eq(discountGlMappings.discountClassification, m.classification),
            ),
          )
          .returning();
      } else {
        [mapping] = await tx
          .insert(discountGlMappings)
          .values({
            tenantId: ctx.tenantId,
            subDepartmentId: m.subDepartmentId,
            discountClassification: m.classification,
            glAccountId: m.glAccountId,
          })
          .returning();
      }
      results.push(mapping!);
    }

    const event = buildEventFromContext(ctx, 'accounting.discount_gl_mappings.batch_saved.v1', {
      count: input.mappings.length,
    });

    return { result: results, events: [event] };
  });

  await auditLog(ctx, 'accounting.discount_gl_mappings.batch_saved', 'discount_gl_mappings', `batch:${input.mappings.length}`);
  return result;
}
