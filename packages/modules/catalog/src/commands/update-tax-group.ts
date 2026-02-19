import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { taxGroups } from '../schema';
import type { UpdateTaxGroupInput } from '../validation-taxes';

export async function updateTaxGroup(
  ctx: RequestContext,
  taxGroupId: string,
  input: UpdateTaxGroupInput,
) {
  const updated = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(taxGroups)
      .where(and(eq(taxGroups.id, taxGroupId), eq(taxGroups.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Tax group', taxGroupId);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: ctx.user.id };
    if (input.name !== undefined) updates.name = input.name;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [result] = await tx
      .update(taxGroups)
      .set(updates)
      .where(eq(taxGroups.id, taxGroupId))
      .returning();

    const changes = computeChanges(existing, result!, ['updatedAt', 'updatedBy']);

    const event = buildEventFromContext(ctx, 'tax.group.updated.v1', {
      taxGroupId,
      changes: changes ?? {},
    });

    return { result: result!, events: [event] };
  });

  await auditLog(ctx, 'tax.group.updated', 'tax_group', taxGroupId);
  return updated;
}
