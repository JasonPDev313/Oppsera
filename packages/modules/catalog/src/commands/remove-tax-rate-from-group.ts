import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxGroups, taxGroupRates } from '../schema';
import type { RemoveTaxRateFromGroupInput } from '../validation-taxes';

export async function removeTaxRateFromGroup(
  ctx: RequestContext,
  input: RemoveTaxRateFromGroupInput,
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

    // Delete the rate from the group
    await tx
      .delete(taxGroupRates)
      .where(
        and(
          eq(taxGroupRates.taxGroupId, input.taxGroupId),
          eq(taxGroupRates.taxRateId, input.taxRateId),
        ),
      );

    const event = buildEventFromContext(ctx, 'tax.group.updated.v1', {
      taxGroupId: input.taxGroupId,
      changes: { rateRemoved: { old: input.taxRateId, new: null } },
    });

    return { result: undefined, events: [event] };
  });

  await auditLog(ctx, 'tax.group.rate_removed', 'tax_group', input.taxGroupId);
}
