import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxRates } from '../schema';
import type { UpdateTaxRateInput } from '../validation-taxes';

export async function updateTaxRate(
  ctx: RequestContext,
  taxRateId: string,
  input: UpdateTaxRateInput,
) {
  const updated = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.id, taxRateId), eq(taxRates.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Tax rate', taxRateId);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: ctx.user.id };
    if (input.name !== undefined) updates.name = input.name;
    if (input.rateDecimal !== undefined) updates.rateDecimal = String(input.rateDecimal);
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.jurisdictionCode !== undefined) updates.jurisdictionCode = input.jurisdictionCode;
    if (input.authorityName !== undefined) updates.authorityName = input.authorityName;
    if (input.authorityType !== undefined) updates.authorityType = input.authorityType;
    if (input.taxType !== undefined) updates.taxType = input.taxType;
    if (input.filingFrequency !== undefined) updates.filingFrequency = input.filingFrequency;

    const [result] = await tx
      .update(taxRates)
      .set(updates)
      .where(eq(taxRates.id, taxRateId))
      .returning();

    const changes = computeChanges(existing, result!, ['updatedAt', 'updatedBy']);

    const event = buildEventFromContext(ctx, 'tax.rate.updated.v1', {
      taxRateId,
      changes: changes ?? {},
    });

    return { result: result!, events: [event] };
  });

  await auditLog(ctx, 'tax.rate.updated', 'tax_rate', taxRateId);
  return updated;
}
