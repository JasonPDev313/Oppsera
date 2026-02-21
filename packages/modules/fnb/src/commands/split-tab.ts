import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { SplitTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, TabVersionConflictError, TabStatusConflictError } from '../errors';

const SPLITTABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested'];

export async function splitTab(
  ctx: RequestContext,
  tabId: string,
  input: SplitTabInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'splitTab',
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

    if (!SPLITTABLE_STATUSES.includes(tab.status)) {
      throw new TabStatusConflictError(tabId, tab.status, 'split');
    }

    if (tab.version !== input.expectedVersion) {
      throw new TabVersionConflictError(tabId);
    }

    // Mark original tab as split
    const [updated] = await (tx as any)
      .update(fnbTabs)
      .set({
        status: 'split',
        splitStrategy: input.strategy,
        version: tab.version + 1,
        updatedAt: new Date(),
        metadata: {
          ...(tab.metadata as Record<string, unknown> ?? {}),
          splitDetails: input.details ?? null,
        },
      })
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.version, input.expectedVersion),
      ))
      .returning();

    if (!updated) throw new TabVersionConflictError(tabId);

    // Note: actual child tab creation depends on split strategy details
    // and will involve creating new orders via the orders module.
    // This command marks the parent tab as split. Child tabs are created
    // by the orchestration layer (API route) which calls openTab for each
    // new split check with splitFromTabId set.

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_SPLIT, {
      tabId,
      locationId: tab.locationId,
      strategy: input.strategy,
      newTabIds: [], // populated by orchestration layer
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'splitTab', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.split', 'fnb_tabs', tabId, undefined, {
    strategy: input.strategy,
  });

  return result;
}
