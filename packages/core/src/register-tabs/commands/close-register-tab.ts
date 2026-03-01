import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { AppError, NotFoundError } from '@oppsera/shared';
import { registerTabs } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { CloseRegisterTabInput } from '../validation';
import type { RegisterTabRow } from '../types';

export async function closeRegisterTab(
  ctx: RequestContext,
  input: CloseRegisterTabInput,
): Promise<RegisterTabRow> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [current] = await tx
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.id, input.tabId),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      );

    if (!current) {
      throw new NotFoundError('Register tab', input.tabId);
    }

    if (current.status === 'closed') {
      throw new AppError('TAB_ALREADY_CLOSED', 'Tab is already closed', 409);
    }

    // Optimistic locking check
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Tab was modified by another device (expected version ${input.expectedVersion}, current ${current.version})`,
        409,
      );
    }

    const [updated] = await tx
      .update(registerTabs)
      .set({
        status: 'closed',
        orderId: null,
        updatedAt: new Date(),
        version: sql`${registerTabs.version} + 1`,
      })
      .where(
        and(
          eq(registerTabs.id, input.tabId),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(
      ctx,
      'pos.register_tab.closed.v1',
      {
        tabId: updated!.id,
        terminalId: updated!.terminalId,
        tabNumber: updated!.tabNumber,
        version: updated!.version,
        previousOrderId: current.orderId,
      },
    );

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'register_tab.closed', 'register_tab', result.id);

  return result as RegisterTabRow;
}
