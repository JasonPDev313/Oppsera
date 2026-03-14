import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orderLines, fnbKitchenTicketItems } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared/types/events';
import type { RequestContext } from '@oppsera/core/auth/context';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { extractModifierIds, formatModifierSummary } from '../helpers/kds-modifier-helpers';
import { createKitchenTicket } from '../commands/create-kitchen-ticket';
import { recordKdsSend, markKdsSendSent } from '../commands/record-kds-send';

const KDS_ITEM_TYPES = ['food', 'beverage'];

/**
 * Consumer: handles order.placed.v1 for retail POS → KDS ticket creation.
 *
 * When a retail order is placed (no FnB tab), this consumer:
 * 1. Fetches order lines filtered to food/beverage
 * 2. Enriches items with catalog hierarchy (categoryId, departmentId) + modifierIds
 * 3. Bulk-resolves KDS stations via the routing engine
 * 4. Groups items by station, creates tickets serially
 *
 * Idempotent via deterministic clientRequestId per order+station.
 * Never throws — logs errors and continues.
 */
export async function handleOrderPlacedForKds(event: EventEnvelope): Promise<void> {
  const data = event.data as {
    orderId: string;
    locationId: string;
    businessDate: string;
    customerName?: string | null;
    employeeId?: string;
    employeeName?: string | null;
    orderType?: string;
  };

  if (!data.orderId || !data.locationId) return;
  if (!event.tenantId) return;

  try {
    // 1. Fetch food/beverage order lines (acquires + releases its own conn)
    interface OrderLineRow {
      id: string;
      catalogItemId: string;
      catalogItemName: string;
      subDepartmentId: string | null;
      qty: string;
      modifiers: unknown;
      specialInstructions: string | null;
      seatNumber: number | null;
    }

    const lines: OrderLineRow[] = await withTenant(event.tenantId, (tx) =>
      tx
        .select({
          id: orderLines.id,
          catalogItemId: orderLines.catalogItemId,
          catalogItemName: orderLines.catalogItemName,
          subDepartmentId: orderLines.subDepartmentId,
          qty: orderLines.qty,
          modifiers: orderLines.modifiers,
          specialInstructions: orderLines.specialInstructions,
          seatNumber: orderLines.seatNumber,
        })
        .from(orderLines)
        .where(
          and(
            eq(orderLines.tenantId, event.tenantId),
            eq(orderLines.orderId, data.orderId),
            inArray(orderLines.itemType, KDS_ITEM_TYPES),
          ),
        ),
    ) as OrderLineRow[];

    if (!lines.length) {
      logger.debug('[kds] handleOrderPlacedForKds: no food/bev lines found', {
        domain: 'kds', tenantId: event.tenantId, orderId: data.orderId, locationId: data.locationId,
      });
      return;
    }

    logger.info('[kds] handleOrderPlacedForKds: processing order', {
      domain: 'kds', tenantId: event.tenantId, orderId: data.orderId,
      locationId: data.locationId, lineCount: lines.length,
    });

    // 1b. Filter out lines already sent to KDS via manual send-to-kds flow
    const lineIds = lines.map((l) => l.id);
    const existingTicketItems = await withTenant(event.tenantId, (tx) =>
      tx
        .select({ orderLineId: fnbKitchenTicketItems.orderLineId })
        .from(fnbKitchenTicketItems)
        .where(
          and(
            eq(fnbKitchenTicketItems.tenantId, event.tenantId),
            inArray(fnbKitchenTicketItems.orderLineId, lineIds),
          ),
        ),
    );
    const alreadySentIds = new Set(
      (existingTicketItems as Array<{ orderLineId: string }>).map((r) => r.orderLineId),
    );
    const filteredLines = lines.filter((l) => !alreadySentIds.has(l.id));
    if (!filteredLines.length) return;

    // 2. Build routable items with modifierIds extracted from JSONB
    let routableItems: RoutableItem[] = filteredLines.map((line) => ({
      orderLineId: line.id,
      catalogItemId: line.catalogItemId,
      subDepartmentId: line.subDepartmentId ?? null,
      modifierIds: extractModifierIds(line.modifiers),
    }));

    // 3. Enrich with categoryId + departmentId from catalog hierarchy
    routableItems = await enrichRoutableItems(event.tenantId, routableItems);

    // 4. Bulk-resolve stations with full context
    const routingResults = await resolveStationRouting(
      { tenantId: event.tenantId, locationId: data.locationId, orderType: data.orderType, channel: 'pos' },
      routableItems,
    );

    // Log items that couldn't be routed (no eligible station)
    const unrouted = routingResults.filter((r) => !r.stationId);
    if (unrouted.length > 0) {
      logger.warn('[kds] handleOrderPlacedForKds: unroutable items', {
        domain: 'kds', tenantId: event.tenantId, orderId: data.orderId,
        locationId: data.locationId, unroutedCount: unrouted.length, totalLines: filteredLines.length,
      });
    }

    // 5. Build a line lookup and group routed items by station
    const lineMap = new Map(filteredLines.map((l) => [l.id, l]));

    const stationGroups = new Map<string, Array<{
      orderLineId: string;
      itemName: string;
      modifierSummary?: string;
      specialInstructions?: string;
      seatNumber?: number;
      quantity: number;
      catalogItemId?: string;
      subDepartmentId?: string;
      stationId: string;
    }>>();

    for (const r of routingResults) {
      if (!r.stationId) continue;
      const line = lineMap.get(r.orderLineId);
      if (!line) continue;

      const group = stationGroups.get(r.stationId) ?? [];
      group.push({
        orderLineId: r.orderLineId,
        itemName: line.catalogItemName,
        modifierSummary: formatModifierSummary(line.modifiers) ?? undefined,
        specialInstructions: line.specialInstructions ?? undefined,
        seatNumber: line.seatNumber ?? undefined,
        quantity: Number(line.qty) || 1,
        catalogItemId: line.catalogItemId,
        subDepartmentId: line.subDepartmentId ?? undefined,
        stationId: r.stationId,
      });
      stationGroups.set(r.stationId, group);
    }

    if (stationGroups.size === 0) {
      logger.warn('[kds] handleOrderPlacedForKds: no stations resolved — no tickets created', {
        domain: 'kds', tenantId: event.tenantId, orderId: data.orderId, locationId: data.locationId,
      });
      return;
    }

    logger.info('[kds] handleOrderPlacedForKds: creating tickets', {
      domain: 'kds', tenantId: event.tenantId, orderId: data.orderId,
      locationId: data.locationId, stationCount: stationGroups.size,
    });

    // 6a. Pre-fetch station names for send tracking (non-critical, batch query)
    const stationNameMap = new Map<string, string>();
    try {
      const stationIds = Array.from(stationGroups.keys());
      const stationNameRows = await withTenant(event.tenantId, (tx) =>
        tx.execute(sql`
          SELECT id, display_name FROM fnb_kitchen_stations
          WHERE tenant_id = ${event.tenantId} AND id IN (${sql.join(stationIds.map((id) => sql`${id}`), sql`, `)})
        `),
      );
      for (const row of Array.from(stationNameRows as Iterable<Record<string, unknown>>)) {
        stationNameMap.set(row.id as string, (row.display_name as string) ?? 'Unknown');
      }
    } catch {
      // Non-critical — send tracking will use fallback names
    }

    // 6. Create one ticket per station (serial to avoid pool exhaustion — gotcha #466)
    const syntheticCtx = {
      tenantId: event.tenantId,
      locationId: data.locationId,
      user: {
        id: data.employeeId ?? event.actorUserId ?? 'system',
        email: 'system@oppsera.com',
        role: 'system',
      },
      requestId: `retail-kds-${data.orderId}`,
      isPlatformAdmin: false,
    } as unknown as RequestContext;

    for (const [stationId, ticketItems] of stationGroups) {
      try {
        // Use same clientRequestId format as manual send-to-kds flow
        // so idempotency prevents duplicates if both paths run concurrently
        const sortedLineIds = ticketItems.map((i) => i.orderLineId).sort().join(',');
        const ticket = await createKitchenTicket(syntheticCtx, {
          clientRequestId: `retail-kds-send-${data.orderId}-${stationId}-${sortedLineIds}`,
          orderId: data.orderId,
          businessDate: data.businessDate,
          channel: 'pos',
          customerName: data.customerName ?? undefined,
          items: ticketItems,
        });

        // Record send tracking so orders appear in KDS Order Status
        try {
          const tokenRows = await withTenant(event.tenantId, (t) => t.execute(sql`SELECT gen_ulid() AS token`));
          const sendToken = Array.from(tokenRows as Iterable<Record<string, unknown>>)[0]!.token as string;
          const tracked = await recordKdsSend({
            tenantId: event.tenantId,
            locationId: data.locationId,
            orderId: data.orderId,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            courseId: undefined,
            courseNumber: ticket.courseNumber ?? undefined,
            stationId,
            stationName: stationNameMap.get(stationId) ?? stationId,
            employeeId: data.employeeId ?? event.actorUserId ?? 'system',
            employeeName: data.employeeName ?? 'System',
            sendToken,
            sendType: 'initial',
            routingReason: 'routing_rule',
            itemCount: ticketItems.length,
            orderType: undefined,
            tableName: undefined,
            guestName: data.customerName ?? undefined,
            businessDate: data.businessDate,
          });
          await markKdsSendSent(event.tenantId, tracked.sendToken);
        } catch (trackErr) {
          logger.warn('[kds] handleOrderPlacedForKds: send tracking failed (non-critical)', {
            domain: 'kds', tenantId: event.tenantId, ticketId: ticket.id, stationId,
            error: { message: trackErr instanceof Error ? trackErr.message : String(trackErr) },
          });
        }
      } catch (err) {
        logger.warn('[kds] handleOrderPlacedForKds: failed to create ticket for station', {
          domain: 'kds', tenantId: event.tenantId, orderId: data.orderId,
          stationId, locationId: data.locationId,
          error: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  } catch (err) {
    // Consumer must never throw
    logger.error('[kds] handleOrderPlacedForKds: unhandled error', {
      domain: 'kds', tenantId: event.tenantId, orderId: data.orderId,
      locationId: data.locationId,
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
  }
}
