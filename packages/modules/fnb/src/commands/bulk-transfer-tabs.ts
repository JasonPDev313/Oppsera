import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTabTransfers, fnbManagerOverrides } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { BulkTransferTabsInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

const TRANSFERABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested'];

export interface BulkTransferResult {
  succeeded: string[];
  failed: { tabId: string; error: string }[];
  overrideId: string;
}

export async function bulkTransferTabs(
  ctx: RequestContext,
  input: BulkTransferTabsInput,
): Promise<BulkTransferResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bulkTransferTabs',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as BulkTransferResult, events: [] };
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
      if (!TRANSFERABLE_STATUSES.includes(tab.status)) {
        failed.push({ tabId, error: `Cannot transfer tab in status '${tab.status}'` });
        continue;
      }
      if (tab.serverUserId === input.toServerUserId) {
        failed.push({ tabId, error: 'Tab already assigned to target server' });
        continue;
      }

      const fromServerUserId = tab.serverUserId;

      // Transfer the tab
      await (tx as any)
        .update(fnbTabs)
        .set({
          transferredFromServerUserId: fromServerUserId,
          serverUserId: input.toServerUserId,
          version: tab.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(fnbTabs.id, tabId));

      // Record transfer audit
      await (tx as any)
        .insert(fnbTabTransfers)
        .values({
          tenantId: ctx.tenantId,
          tabId,
          transferType: 'server',
          fromServerUserId,
          toServerUserId: input.toServerUserId,
          reason: input.reasonText ?? input.reasonCode,
          transferredBy: ctx.user.id,
        });

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
        approverUserId: input.approverUserId ?? ctx.user.id,
        actionType: 'bulk_transfer',
        tabIds: input.tabIds,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText ?? null,
        metadata: { toServerUserId: input.toServerUserId },
        resultSummary,
        idempotencyKey: input.clientRequestId,
      })
      .returning();

    const bulkResult: BulkTransferResult = {
      succeeded,
      failed,
      overrideId: override.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABS_BULK_TRANSFERRED, {
      overrideId: override.id,
      locationId: input.locationId,
      tabIds: input.tabIds,
      toServerUserId: input.toServerUserId,
      initiatorUserId: ctx.user.id,
      approverUserId: input.approverUserId ?? ctx.user.id,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText ?? null,
      resultSummary,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bulkTransferTabs', bulkResult);

    return { result: bulkResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tabs.bulk_transferred', 'fnb_manager_overrides', result.overrideId, undefined, {
    tabCount: input.tabIds.length,
    succeeded: result.succeeded.length,
    failed: result.failed.length,
    toServerUserId: input.toServerUserId,
    reasonCode: input.reasonCode,
  });

  return result;
}
