import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateTabInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, TabVersionConflictError, TabStatusConflictError } from '../errors';

const MUTABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress'];

export async function updateTab(
  ctx: RequestContext,
  tabId: string,
  input: UpdateTabInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateTab',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Fetch tab with version check
    const [tab] = await (tx as any)
      .select()
      .from(fnbTabs)
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!tab) throw new TabNotFoundError(tabId);

    if (!MUTABLE_STATUSES.includes(tab.status)) {
      throw new TabStatusConflictError(tabId, tab.status, 'update');
    }

    if (tab.version !== input.expectedVersion) {
      throw new TabVersionConflictError(tabId);
    }

    // Build changes
    const changes: Record<string, unknown> = {};
    const setFields: Record<string, unknown> = {
      version: tab.version + 1,
      updatedAt: new Date(),
    };

    if (input.partySize !== undefined) {
      setFields.partySize = input.partySize;
      changes.partySize = { from: tab.partySize, to: input.partySize };
    }
    if (input.guestName !== undefined) {
      setFields.guestName = input.guestName;
      changes.guestName = { from: tab.guestName, to: input.guestName };
    }
    if (input.serviceType !== undefined) {
      setFields.serviceType = input.serviceType;
      changes.serviceType = { from: tab.serviceType, to: input.serviceType };
    }
    if (input.currentCourseNumber !== undefined) {
      setFields.currentCourseNumber = input.currentCourseNumber;
      changes.currentCourseNumber = { from: tab.currentCourseNumber, to: input.currentCourseNumber };
    }
    if (input.customerId !== undefined) {
      setFields.customerId = input.customerId;
      changes.customerId = { from: tab.customerId, to: input.customerId };
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

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_UPDATED, {
      tabId,
      changes,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateTab', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.updated', 'fnb_tabs', tabId);
  return result;
}
