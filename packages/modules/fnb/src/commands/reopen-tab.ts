import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { ReopenTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, TabVersionConflictError, TabStatusConflictError } from '../errors';

export async function reopenTab(
  ctx: RequestContext,
  tabId: string,
  input: ReopenTabInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'reopenTab',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [tab] = await (tx as any)
      .select()
      .from(fnbTabs)
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!tab) throw new TabNotFoundError(tabId);

    if (tab.status !== 'closed') {
      throw new TabStatusConflictError(tabId, tab.status, 'reopen');
    }

    if (tab.version !== input.expectedVersion) {
      throw new TabVersionConflictError(tabId);
    }

    const [updated] = await (tx as any)
      .update(fnbTabs)
      .set({
        status: 'open',
        closedAt: null,
        version: tab.version + 1,
        updatedAt: new Date(),
      })
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.version, input.expectedVersion),
      ))
      .returning();

    if (!updated) throw new TabVersionConflictError(tabId);

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_REOPENED, {
      tabId,
      locationId: tab.locationId,
      reopenedBy: ctx.user.id,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'reopenTab', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.reopened', 'fnb_tabs', tabId);
  return result;
}
