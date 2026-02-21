import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import { terminalLocations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateProfitCenterInput } from '../validation';

export async function updateProfitCenter(
  ctx: RequestContext,
  profitCenterId: string,
  input: UpdateProfitCenterInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify exists and belongs to tenant
    const [existing] = await tx
      .select({ id: terminalLocations.id })
      .from(terminalLocations)
      .where(
        and(
          eq(terminalLocations.tenantId, ctx.tenantId),
          eq(terminalLocations.id, profitCenterId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Profit Center', profitCenterId);
    }

    // Build update object — only include provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.title = input.name;
    if (input.code !== undefined) updates.code = input.code;
    if (input.description !== undefined) updates.description = input.description;
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.tipsApplicable !== undefined) updates.tipsApplicable = input.tipsApplicable;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(terminalLocations)
      .set(updates)
      .where(eq(terminalLocations.id, profitCenterId))
      .returning();

    const event = buildEventFromContext(ctx, 'platform.profit_center.updated.v1', {
      profitCenterId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'platform.profit_center.updated', 'terminal_location', result.id);
  return result;
}
