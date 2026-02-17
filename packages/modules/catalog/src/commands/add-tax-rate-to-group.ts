import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxGroups, taxGroupRates, taxRates } from '../schema';
import type { AddTaxRateToGroupInput } from '../validation-taxes';

export async function addTaxRateToGroup(
  ctx: RequestContext,
  input: AddTaxRateToGroupInput,
) {
  await publishWithOutbox(ctx, async (tx) => {
    // Verify group belongs to tenant
    const [group] = await tx
      .select()
      .from(taxGroups)
      .where(
        and(eq(taxGroups.id, input.taxGroupId), eq(taxGroups.tenantId, ctx.tenantId)),
      )
      .limit(1);

    if (!group) {
      throw new NotFoundError('Tax group', input.taxGroupId);
    }

    // Verify rate belongs to tenant
    const [rate] = await tx
      .select()
      .from(taxRates)
      .where(
        and(eq(taxRates.id, input.taxRateId), eq(taxRates.tenantId, ctx.tenantId)),
      )
      .limit(1);

    if (!rate) {
      throw new NotFoundError('Tax rate', input.taxRateId);
    }

    // Insert (idempotent — ON CONFLICT DO NOTHING)
    await tx
      .insert(taxGroupRates)
      .values({
        tenantId: ctx.tenantId,
        taxGroupId: input.taxGroupId,
        taxRateId: input.taxRateId,
        sortOrder: input.sortOrder,
      })
      .onConflictDoNothing();

    const event = buildEventFromContext(ctx, 'tax.group.updated.v1', {
      taxGroupId: input.taxGroupId,
      changes: { rateAdded: { old: null, new: input.taxRateId } },
    });

    return { result: undefined, events: [event] };
  });

  await auditLog(ctx, 'tax.group.rate_added', 'tax_group', input.taxGroupId);
}
