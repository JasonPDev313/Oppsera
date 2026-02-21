import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTableLiveStatus } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CloseTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, TabVersionConflictError, TabStatusConflictError } from '../errors';

const CLOSEABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested', 'paying'];

export async function closeTab(
  ctx: RequestContext,
  tabId: string,
  input: CloseTabInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'closeTab',
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

    if (!CLOSEABLE_STATUSES.includes(tab.status)) {
      throw new TabStatusConflictError(tabId, tab.status, 'close');
    }

    if (tab.version !== input.expectedVersion) {
      throw new TabVersionConflictError(tabId);
    }

    const [updated] = await (tx as any)
      .update(fnbTabs)
      .set({
        status: 'closed',
        closedAt: new Date(),
        version: tab.version + 1,
        updatedAt: new Date(),
      })
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.version, input.expectedVersion),
      ))
      .returning();

    if (!updated) throw new TabVersionConflictError(tabId);

    // Clear table live status if dine-in
    if (tab.tableId) {
      await (tx as any)
        .update(fnbTableLiveStatus)
        .set({
          status: 'dirty',
          currentTabId: null,
          currentServerUserId: null,
          partySize: null,
          guestNames: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
          eq(fnbTableLiveStatus.tableId, tab.tableId),
        ));
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_CLOSED, {
      tabId,
      locationId: tab.locationId,
      tableId: tab.tableId,
      serverUserId: tab.serverUserId,
      businessDate: tab.businessDate,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'closeTab', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.closed', 'fnb_tabs', tabId);
  return result;
}
