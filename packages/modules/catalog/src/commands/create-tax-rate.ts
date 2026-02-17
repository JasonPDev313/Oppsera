import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { ConflictError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxRates } from '../schema';
import type { CreateTaxRateInput } from '../validation-taxes';

export async function createTaxRate(ctx: RequestContext, input: CreateTaxRateInput) {
  const taxRate = await publishWithOutbox(ctx, async (tx) => {
    const existing = await tx
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.tenantId, ctx.tenantId), eq(taxRates.name, input.name)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`Tax rate "${input.name}" already exists`);
    }

    const [created] = await tx
      .insert(taxRates)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        rateDecimal: String(input.rateDecimal),
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'tax.rate.created.v1', {
      taxRateId: created!.id,
      name: created!.name,
      rateDecimal: Number(created!.rateDecimal),
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'tax.rate.created', 'tax_rate', taxRate.id);
  return taxRate;
}
