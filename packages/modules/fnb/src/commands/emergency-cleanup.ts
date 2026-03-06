import { eq, and, lt, inArray, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
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
    // Only close tabs where tender amount >= order total (actually paid, not just started paying)
    if (input.actions.closePaidTabs) {
      const payingRows = await tx.execute(sql`
        SELECT t.*
        FROM fnb_tabs t
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(td.amount), 0) AS paid
          FROM tenders td
          WHERE td.tenant_id = t.tenant_id
            AND td.order_id = t.primary_order_id
            AND td.status != 'reversed'
        ) tender_agg ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(o.total, 0) AS total
          FROM orders o
          WHERE o.id = t.primary_order_id
            AND o.tenant_id = t.tenant_id
            AND o.status NOT IN ('voided', 'cancelled')
        ) order_agg ON true
        WHERE t.tenant_id = ${ctx.tenantId}
          AND t.location_id = ${input.locationId}
          AND t.status = 'paying'
          AND tender_agg.paid >= order_agg.total
      `);
      const payingTabs = Array.from(payingRows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        version: Number(r.version),
        tableId: r.table_id as string | null,
      }));

      for (const tab of payingTabs) {
        await tx.execute(sql`
          UPDATE fnb_tabs SET status = 'closed', closed_at = NOW(),
            version = version + 1, updated_at = NOW()
          WHERE id = ${tab.id}
        `);

        if (tab.tableId) {
          await tx.execute(sql`
            UPDATE fnb_table_live_status SET status = 'dirty',
              current_tab_id = NULL, current_server_user_id = NULL,
              party_size = NULL, guest_names = NULL, updated_at = NOW()
            WHERE tenant_id = ${ctx.tenantId} AND table_id = ${tab.tableId}
          `);
        }

        paidTabsClosed++;
        affectedTabIds.push(tab.id);
      }
    }

    // Sub-operation 2: Release soft locks scoped to this location
    // Locks reference entities (tabs/tables) — scope by joining entity to location
    if (input.actions.releaseLocks) {
      const deleteResult = await tx
        .delete(fnbSoftLocks)
        .where(and(
          eq(fnbSoftLocks.tenantId, ctx.tenantId),
          sql`(
            (${fnbSoftLocks.entityType} = 'tab' AND ${fnbSoftLocks.entityId} IN (
              SELECT id FROM fnb_tabs WHERE tenant_id = ${ctx.tenantId} AND location_id = ${input.locationId}
            ))
            OR (${fnbSoftLocks.entityType} = 'table' AND ${fnbSoftLocks.entityId} IN (
              SELECT id FROM fnb_tables WHERE tenant_id = ${ctx.tenantId} AND location_id = ${input.locationId}
            ))
          )`,
        ))
        .returning();

      locksReleased = deleteResult.length;
    }

    // Sub-operation 3: Void stale tabs older than threshold
    if (input.actions.voidStaleTabs) {
      const thresholdMinutes = input.actions.staleThresholdMinutes ?? 240;
      const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

      const staleTabs = await tx
        .select()
        .from(fnbTabs)
        .where(and(
          eq(fnbTabs.tenantId, ctx.tenantId),
          eq(fnbTabs.locationId, input.locationId),
          inArray(fnbTabs.status, ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested']),
          lt(fnbTabs.openedAt, cutoff),
        ));

      for (const tab of staleTabs) {
        await tx
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
          .where(and(eq(fnbTabs.id, tab.id), eq(fnbTabs.version, tab.version)));

        if (tab.tableId) {
          await tx
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
      }
    }

    // Sub-operation 4: Mark stale tabs as abandoned (less destructive than void)
    if (input.actions.markAbandoned) {
      const abandonedThreshold = input.actions.abandonedThresholdMinutes ?? 480;
      const abandonedCutoff = new Date(Date.now() - abandonedThreshold * 60 * 1000);

      const abandonedTabs = await tx
        .select()
        .from(fnbTabs)
        .where(and(
          eq(fnbTabs.tenantId, ctx.tenantId),
          eq(fnbTabs.locationId, input.locationId),
          inArray(fnbTabs.status, ['open', 'ordering']),
          lt(fnbTabs.openedAt, abandonedCutoff),
        ));

      for (const tab of abandonedTabs) {
        await tx
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
          .where(and(eq(fnbTabs.id, tab.id), eq(fnbTabs.version, tab.version)));

        if (tab.tableId) {
          await tx
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
      }
    }

    const resultSummary = { paidTabsClosed, locksReleased, staleTabsVoided, staleTabsAbandoned, errors };

    // Insert manager override audit row
    const [override] = await tx
      .insert(fnbManagerOverrides)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        initiatorUserId: ctx.user.id,
        approverUserId: input.approverUserId,
        actionType: 'emergency_cleanup',
        tabIds: affectedTabIds,
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
      overrideId: override!.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABS_EMERGENCY_CLEANUP, {
      overrideId: override!.id,
      locationId: input.locationId,
      initiatorUserId: ctx.user.id,
      approverUserId: input.approverUserId,
      actions: input.actions,
      resultSummary,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'emergencyCleanup', cleanupResult);

    return { result: cleanupResult, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tabs.emergency_cleanup', 'fnb_manager_overrides', result.overrideId, undefined, {
    paidTabsClosed: result.paidTabsClosed,
    locksReleased: result.locksReleased,
    staleTabsVoided: result.staleTabsVoided,
    staleTabsAbandoned: result.staleTabsAbandoned,
  });

  return result;
}
