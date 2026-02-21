import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import { terminalLocations, terminals } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deactivateProfitCenter(
  ctx: RequestContext,
  profitCenterId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
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

    // Deactivate the profit center
    const [updated] = await tx
      .update(terminalLocations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(terminalLocations.id, profitCenterId))
      .returning();

    // Also deactivate all child terminals
    await tx
      .update(terminals)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(terminals.tenantId, ctx.tenantId),
          eq(terminals.terminalLocationId, profitCenterId),
          eq(terminals.isActive, true),
        ),
      );

    const event = buildEventFromContext(ctx, 'platform.profit_center.deactivated.v1', {
      profitCenterId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'platform.profit_center.deactivated', 'terminal_location', result.id);
  return result;
}
