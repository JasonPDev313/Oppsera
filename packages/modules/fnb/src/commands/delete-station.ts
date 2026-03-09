import { eq, and, inArray, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { logger } from '@oppsera/core/observability';
import {
  fnbKitchenStations,
  fnbStationDisplayConfigs,
  fnbKitchenRoutingRules,
  fnbStationMetricsSnapshot,
  fnbKitchenTicketItems,
  fnbKdsPerformanceTargets,
  fnbKdsItemPrepTimes,
  fnbPrintRoutingRules,
} from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { FNB_EVENTS } from '../events/types';
import { StationNotFoundError } from '../errors';

export async function deleteStation(
  ctx: RequestContext,
  stationId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const conditions = [
      eq(fnbKitchenStations.id, stationId),
      eq(fnbKitchenStations.tenantId, ctx.tenantId),
    ];
    // Scope to location if available (prevents cross-location deletion)
    if (ctx.locationId) {
      conditions.push(eq(fnbKitchenStations.locationId, ctx.locationId));
    }
    const [station] = await tx
      .select()
      .from(fnbKitchenStations)
      .where(and(...conditions))
      .limit(1);
    if (!station) throw new StationNotFoundError(stationId);

    // Auto-void stale ticket items from previous business dates.
    // These are orphaned items that are no longer visible on the KDS screen
    // (which filters by today's business_date) but would block deletion.
    const today = new Date().toISOString().slice(0, 10);
    const staleResult = await tx.execute(sql`
      UPDATE fnb_kitchen_ticket_items kti
      SET item_status = 'voided', voided_at = NOW(), updated_at = NOW()
      FROM fnb_kitchen_tickets kt
      WHERE kti.ticket_id = kt.id
        AND kti.station_id = ${stationId}
        AND kti.tenant_id = ${ctx.tenantId}
        AND kti.item_status IN ('pending', 'cooking')
        AND kt.business_date < ${today}
    `);
    const staleCount = (staleResult as { count?: number }).count ?? 0;
    if (staleCount > 0) {
      logger.info('[KDS] Auto-voided stale ticket items from previous business dates', {
        domain: 'kds',
        stationId,
        tenantId: ctx.tenantId,
        voidedCount: staleCount,
      });
    }

    // Also void parent tickets that now have ALL items voided (from the stale cleanup above)
    await tx.execute(sql`
      UPDATE fnb_kitchen_tickets kt
      SET status = 'voided', voided_at = NOW(), updated_at = NOW()
      WHERE kt.tenant_id = ${ctx.tenantId}
        AND kt.business_date < ${today}
        AND kt.status IN ('pending', 'in_progress')
        AND NOT EXISTS (
          SELECT 1 FROM fnb_kitchen_ticket_items kti2
          WHERE kti2.ticket_id = kt.id
            AND kti2.item_status NOT IN ('voided', 'served', 'ready')
        )
    `);

    // Block deletion if station has in-progress ticket items (today only)
    const [activeCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(fnbKitchenTicketItems)
      .where(and(
        eq(fnbKitchenTicketItems.stationId, stationId),
        eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
        inArray(fnbKitchenTicketItems.itemStatus, ['pending', 'cooking']),
      ));
    if (activeCount && activeCount.count > 0) {
      throw new Error(
        `Cannot delete station "${station.name}" — it has ${activeCount.count} active ticket item(s) from today. Bump or void them first.`,
      );
    }

    // Clean up child records
    await tx
      .delete(fnbStationDisplayConfigs)
      .where(and(
        eq(fnbStationDisplayConfigs.stationId, stationId),
        eq(fnbStationDisplayConfigs.tenantId, ctx.tenantId),
      ));

    await tx
      .delete(fnbKitchenRoutingRules)
      .where(and(
        eq(fnbKitchenRoutingRules.stationId, stationId),
        eq(fnbKitchenRoutingRules.tenantId, ctx.tenantId),
      ));

    await tx
      .delete(fnbStationMetricsSnapshot)
      .where(and(
        eq(fnbStationMetricsSnapshot.stationId, stationId),
        eq(fnbStationMetricsSnapshot.tenantId, ctx.tenantId),
      ));

    await tx
      .delete(fnbKdsPerformanceTargets)
      .where(and(
        eq(fnbKdsPerformanceTargets.stationId, stationId),
        eq(fnbKdsPerformanceTargets.tenantId, ctx.tenantId),
      ));

    await tx
      .delete(fnbKdsItemPrepTimes)
      .where(and(
        eq(fnbKdsItemPrepTimes.stationId, stationId),
        eq(fnbKdsItemPrepTimes.tenantId, ctx.tenantId),
      ));

    // Null out print routing rules that reference this station
    await tx
      .update(fnbPrintRoutingRules)
      .set({ stationId: null, updatedAt: new Date() })
      .where(and(
        eq(fnbPrintRoutingRules.stationId, stationId),
        eq(fnbPrintRoutingRules.tenantId, ctx.tenantId),
      ));

    // Null out fallback references from other stations pointing to this one
    await tx
      .update(fnbKitchenStations)
      .set({ fallbackStationId: null, updatedAt: new Date() })
      .where(and(
        eq(fnbKitchenStations.fallbackStationId, stationId),
        eq(fnbKitchenStations.tenantId, ctx.tenantId),
      ));

    // Delete the station
    await tx
      .delete(fnbKitchenStations)
      .where(eq(fnbKitchenStations.id, stationId));

    const event = buildEventFromContext(ctx, FNB_EVENTS.STATION_DELETED, {
      stationId,
      locationId: ctx.locationId,
      name: station.name,
      stationType: station.stationType,
    });

    return { result: { deleted: true, stationId }, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.station.deleted', 'fnb_kitchen_stations', stationId);
  return result;
}
