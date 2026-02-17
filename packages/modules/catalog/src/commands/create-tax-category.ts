import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { ConflictError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxCategories } from '../schema';
import type { CreateTaxCategoryInput } from '../validation';

export async function createTaxCategory(
  ctx: RequestContext,
  input: CreateTaxCategoryInput,
) {
  const taxCategory = await publishWithOutbox(ctx, async (tx) => {
    const existing = await tx
      .select()
      .from(taxCategories)
      .where(
        and(eq(taxCategories.tenantId, ctx.tenantId), eq(taxCategories.name, input.name)),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`Tax category "${input.name}" already exists`);
    }

    const [created] = await tx
      .insert(taxCategories)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        rate: String(input.rate),
      })
      .returning();

    const event = buildEventFromContext(ctx, 'catalog.tax_category.created.v1', {
      taxCategoryId: created!.id,
      name: created!.name,
      rate: Number(created!.rate),
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'catalog.tax_category.created', 'tax_category', taxCategory.id);

  return taxCategory;
}
