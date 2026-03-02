import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTableLiveStatus, fnbManagerOverrides } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BulkCloseTabsInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

const CLOSEABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested', 'paying'];

export interface BulkCloseResult {
  succeeded: string[];
  failed: { tabId: string; error: string }[];
  overrideId: string;
}

export async function bulkCloseTabs(
  ctx: RequestContext,
  input: BulkCloseTabsInput,
): Promise<BulkCloseResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bulkCloseTabs',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as BulkCloseResult, events: [] };
    }

    // Fetch all tabs in one query
    const tabs = await (tx as any)
      .select()
      .from(fnbTabs)
      .where(and(
        inArray(fnbTabs.id, input.tabIds),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ));

    const succeeded: string[] = [];
    const failed: { tabId: string; error: string }[] = [];

    for (const tabId of input.tabIds) {
      const tab = tabs.find((t: any) => t.id === tabId);
      if (!tab) {
        failed.push({ tabId, error: 'Tab not found' });
        continue;
      }
      if (!CLOSEABLE_STATUSES.includes(tab.status)) {
        failed.push({ tabId, error: `Cannot close tab in status '${tab.status}'` });
        continue;
      }

      // Close the tab
      await (tx as any)
        .update(fnbTabs)
        .set({
          status: 'closed',
          closedAt: new Date(),
          version: tab.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(fnbTabs.id, tabId));

      // Mark table as dirty if dine-in
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

      succeeded.push(tabId);
    }

    const resultSummary = { succeeded: succeeded.length, failed: failed.length, errors: failed };

    // Insert manager override audit row
    const [override] = await (tx as any)
      .insert(fnbManagerOverrides)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        initiatorUserId: ctx.user.id,
        approverUserId: input.approverUserId,
        actionType: 'bulk_close',
        tabIds: input.tabIds,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText ?? null,
        metadata: {},
        resultSummary,
        idempotencyKey: input.clientRequestId,
      })
      .returning();

    const bulkResult: BulkCloseResult = {
      succeeded,
      failed,
      overrideId: override.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABS_BULK_CLOSED, {
      overrideId: override.id,
      locationId: input.locationId,
      tabIds: input.tabIds,
      initiatorUserId: ctx.user.id,
      approverUserId: input.approverUserId,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText ?? null,
      resultSummary,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bulkCloseTabs', bulkResult);

    return { result: bulkResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tabs.bulk_closed', 'fnb_manager_overrides', result.overrideId, undefined, {
    tabCount: input.tabIds.length,
    succeeded: result.succeeded.length,
    failed: result.failed.length,
    reasonCode: input.reasonCode,
  });

  return result;
}
