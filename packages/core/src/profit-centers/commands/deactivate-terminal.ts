import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLogDeferred } from '../../audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import { terminals } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deactivateTerminal(
  ctx: RequestContext,
  terminalId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select({ id: terminals.id })
      .from(terminals)
      .where(
        and(
          eq(terminals.tenantId, ctx.tenantId),
          eq(terminals.id, terminalId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Terminal', terminalId);
    }

    const [updated] = await tx
      .update(terminals)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(terminals.id, terminalId), eq(terminals.tenantId, ctx.tenantId)))
      .returning();

    const event = buildEventFromContext(ctx, 'platform.terminal.deactivated.v1', {
      terminalId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'platform.terminal.deactivated', 'terminal', result.id);
  return result;
}
