import { eq, and, lt, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTableLiveStatus, fnbSoftLocks, fnbManagerOverrides } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { EmergencyCleanupInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export interface EmergencyCleanupResult {
  paidTabsClosed: number;
  locksReleased: number;
  staleTabsVoided: number;
  staleTabsAbandoned: number;
  errors: { tabId: string; error: string }[];
  overrideId: string;
}

export async function emergencyCleanup(
  ctx: RequestContext,
  input: EmergencyCleanupInput,
): Promise<EmergencyCleanupResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'emergencyCleanup',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as EmergencyCleanupResult, events: [] };
    }

    let paidTabsClosed = 0;
    let locksReleased = 0;
    let staleTabsVoided = 0;
    let staleTabsAbandoned = 0;
    const errors: { tabId: string; error: string }[] = [];
    const affectedTabIds: string[] = [];

    // Sub-operation 1: Close tabs that are fully paid but still in 'paying' status
    if (input.actions.closePaidTabs) {
      const payingTabs = await (tx as any)
        .select()
        .from(fnbTabs)
        .where(and(
          eq(fnbTabs.tenantId, ctx.tenantId),
          eq(fnbTabs.locationId, input.locationId),
          eq(fnbTabs.status, 'paying'),
        ));

      for (const tab of payingTabs) {
        try {
          await (tx as any)
            .update(fnbTabs)
            .set({
              status: 'closed',
              closedAt: new Date(),
              version: tab.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(fnbTabs.id, tab.id));

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

          paidTabsClosed++;
          affectedTabIds.push(tab.id);
        } catch (err) {
          errors.push({ tabId: tab.id, error: String(err) });
        }
      }
    }

    // Sub-operation 2: Release all soft locks for the location
    if (input.actions.releaseLocks) {
      const deleteResult = await (tx as any)
        .delete(fnbSoftLocks)
        .where(eq(fnbSoftLocks.tenantId, ctx.tenantId))
        .returning();

      locksReleased = deleteResult.length;
    }

    // Sub-operation 3: Void stale tabs older than threshold
    if (input.actions.voidStaleTabs) {
      const thresholdMinutes = input.actions.staleThresholdMinutes ?? 240;
      const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

      const staleTabs = await (tx as any)
        .select()
        .from(fnbTabs)
        .where(and(
          eq(fnbTabs.tenantId, ctx.tenantId),
          eq(fnbTabs.locationId, input.locationId),
          inArray(fnbTabs.status, ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested']),
          lt(fnbTabs.openedAt, cutoff),
        ));

      for (const tab of staleTabs) {
        try {
          await (tx as any)
            .update(fnbTabs)
            .set({
              status: 'voided',
              closedAt: new Date(),
              version: tab.version + 1,
              updatedAt: new Date(),
              metadata: {
                ...(tab.metadata as Record<string, unknown> ?? {}),
                voidReason: `Stale tab (open > ${thresholdMinutes} min)`,
                voidedBy: ctx.user.id,
                emergencyCleanup: true,
              },
            })
            .where(eq(fnbTabs.id, tab.id));

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

          staleTabsVoided++;
          affectedTabIds.push(tab.id);
        } catch (err) {
          errors.push({ tabId: tab.id, error: String(err) });
        }
      }
    }

    // Sub-operation 4: Mark stale tabs as abandoned (less destructive than void)
    if (input.actions.markAbandoned) {
      const abandonedThreshold = input.actions.abandonedThresholdMinutes ?? 480;
      const abandonedCutoff = new Date(Date.now() - abandonedThreshold * 60 * 1000);

      const abandonedTabs = await (tx as any)
        .select()
        .from(fnbTabs)
        .where(and(
          eq(fnbTabs.tenantId, ctx.tenantId),
          eq(fnbTabs.locationId, input.locationId),
          inArray(fnbTabs.status, ['open', 'ordering']),
          lt(fnbTabs.openedAt, abandonedCutoff),
        ));

      for (const tab of abandonedTabs) {
        try {
          await (tx as any)
            .update(fnbTabs)
            .set({
              status: 'abandoned',
              version: tab.version + 1,
              updatedAt: new Date(),
              metadata: {
                ...(tab.metadata as Record<string, unknown> ?? {}),
                abandonedReason: `Stale tab (open > ${abandonedThreshold} min, no kitchen activity)`,
                abandonedBy: ctx.user.id,
                emergencyCleanup: true,
              },
            })
            .where(eq(fnbTabs.id, tab.id));

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

          staleTabsAbandoned++;
          affectedTabIds.push(tab.id);
        } catch (err) {
          errors.push({ tabId: tab.id, error: String(err) });
        }
      }
    }

    const resultSummary = { paidTabsClosed, locksReleased, staleTabsVoided, staleTabsAbandoned, errors };

    // Insert manager override audit row
    const [override] = await (tx as any)
      .insert(fnbManagerOverrides)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        initiatorUserId: ctx.user.id,
        approverUserId: input.approverUserId,
        actionType: 'emergency_cleanup',
        tabIds: affectedTabIds.length > 0 ? affectedTabIds : ['none'],
        reasonCode: null,
        reasonText: null,
        metadata: { actions: input.actions },
        resultSummary,
        idempotencyKey: input.clientRequestId,
      })
      .returning();

    const cleanupResult: EmergencyCleanupResult = {
      paidTabsClosed,
      locksReleased,
      staleTabsVoided,
      staleTabsAbandoned,
      errors,
      overrideId: override.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABS_EMERGENCY_CLEANUP, {
      overrideId: override.id,
      locationId: input.locationId,
      initiatorUserId: ctx.user.id,
      approverUserId: input.approverUserId,
      actions: input.actions,
      resultSummary,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'emergencyCleanup', cleanupResult);

    return { result: cleanupResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tabs.emergency_cleanup', 'fnb_manager_overrides', result.overrideId, undefined, {
    paidTabsClosed: result.paidTabsClosed,
    locksReleased: result.locksReleased,
    staleTabsVoided: result.staleTabsVoided,
    staleTabsAbandoned: result.staleTabsAbandoned,
  });

  return result;
}
