import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTabTransfers, fnbTableLiveStatus } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { TransferTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, TabVersionConflictError, TabStatusConflictError } from '../errors';

const TRANSFERABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested'];

export async function transferTab(
  ctx: RequestContext,
  tabId: string,
  input: TransferTabInput,
) {
  if (!input.toServerUserId && !input.toTableId) {
    throw new AppError(
      'TRANSFER_TARGET_REQUIRED',
      'Must specify either toServerUserId or toTableId (or both)',
      400,
    );
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'transferTab',
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

    if (!TRANSFERABLE_STATUSES.includes(tab.status)) {
      throw new TabStatusConflictError(tabId, tab.status, 'transfer');
    }

    if (tab.version !== input.expectedVersion) {
      throw new TabVersionConflictError(tabId);
    }

    const setFields: Record<string, unknown> = {
      version: tab.version + 1,
      updatedAt: new Date(),
    };

    // Server transfer
    if (input.toServerUserId) {
      setFields.transferredFromServerUserId = tab.serverUserId;
      setFields.serverUserId = input.toServerUserId;
    }

    // Table transfer
    if (input.toTableId) {
      setFields.transferredFromTabId = tab.tableId;
      setFields.tableId = input.toTableId;

      // Clear old table status
      if (tab.tableId) {
        await (tx as any)
          .update(fnbTableLiveStatus)
          .set({
            status: 'available',
            currentTabId: null,
            currentServerUserId: null,
            partySize: null,
            guestNames: null,
            seatedAt: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
            eq(fnbTableLiveStatus.tableId, tab.tableId),
          ));
      }

      // Set new table status
      await (tx as any)
        .update(fnbTableLiveStatus)
        .set({
          status: 'seated',
          currentTabId: tabId,
          currentServerUserId: input.toServerUserId ?? tab.serverUserId,
          partySize: tab.partySize,
          seatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
          eq(fnbTableLiveStatus.tableId, input.toTableId),
        ));
    }

    const [updated] = await (tx as any)
      .update(fnbTabs)
      .set(setFields)
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.version, input.expectedVersion),
      ))
      .returning();

    if (!updated) throw new TabVersionConflictError(tabId);

    // Record transfer audit
    const transferType = input.toServerUserId && input.toTableId
      ? 'server'
      : input.toServerUserId
        ? 'server'
        : 'table';

    await (tx as any)
      .insert(fnbTabTransfers)
      .values({
        tenantId: ctx.tenantId,
        tabId,
        transferType,
        fromServerUserId: input.toServerUserId ? tab.serverUserId : null,
        toServerUserId: input.toServerUserId ?? null,
        fromTableId: input.toTableId ? tab.tableId : null,
        toTableId: input.toTableId ?? null,
        reason: input.reason ?? null,
        transferredBy: ctx.user.id,
      });

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_TRANSFERRED, {
      tabId,
      locationId: tab.locationId,
      fromServerUserId: input.toServerUserId ? tab.serverUserId : null,
      toServerUserId: input.toServerUserId ?? null,
      fromTableId: input.toTableId ? tab.tableId : null,
      toTableId: input.toTableId ?? null,
      reason: input.reason ?? null,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'transferTab', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.transferred', 'fnb_tabs', tabId, undefined, {
    toServerUserId: input.toServerUserId,
    toTableId: input.toTableId,
  });

  return result;
}
