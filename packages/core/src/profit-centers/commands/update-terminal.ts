import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import { terminals } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateTerminalInput } from '../validation';

export async function updateTerminal(
  ctx: RequestContext,
  terminalId: string,
  input: UpdateTerminalInput,
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

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.title = input.name;
    if (input.terminalNumber !== undefined) updates.terminalNumber = input.terminalNumber;
    if (input.deviceIdentifier !== undefined) updates.deviceIdentifier = input.deviceIdentifier;
    if (input.ipAddress !== undefined) updates.ipAddress = input.ipAddress;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(terminals)
      .set(updates)
      .where(eq(terminals.id, terminalId))
      .returning();

    const event = buildEventFromContext(ctx, 'platform.terminal.updated.v1', {
      terminalId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'platform.terminal.updated', 'terminal', result.id);
  return result;
}
