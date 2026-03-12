import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orderLines, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems, resolveKdsLocationId } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { extractModifierIds, formatModifierSummary } from '../helpers/kds-modifier-helpers';
import { createKitchenTicket } from './create-kitchen-ticket';
import { recordKdsSend, markKdsSendSent, markKdsSendFailed } from './record-kds-send';

const KDS_ITEM_TYPES = ['food', 'beverage'];

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

/**
 * Sends unsent food/beverage order lines to KDS — does NOT change order status.
 *
 * 1. Fetches food/bev lines for the order
 * 2. Filters out lines that already have KDS ticket items
 * 3. Routes new lines to stations via the routing engine
 * 4. Creates one ticket per station for the new lines
 *
 * Returns the count of newly sent items.
 */
export async function sendOrderLinesToKds(
  ctx: RequestContext,
  orderId: string,
  businessDate: string,
  orderType?: string,
): Promise<{ sentCount: number; failedCount: number; totalStations: number }> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  // 1. Fetch food/beverage order lines
  const lines: OrderLineRow[] = await withTenant(ctx.tenantId, (tx) =>
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
          eq(orderLines.tenantId, ctx.tenantId),
          eq(orderLines.orderId, orderId),
          inArray(orderLines.itemType, KDS_ITEM_TYPES),
        ),
      ),
  ) as OrderLineRow[];

  if (!lines.length) {
    logger.debug('[kds] sendOrderLinesToKds: no food/bev lines for order', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
    });
    return { sentCount: 0, failedCount: 0, totalStations: 0 };
  }

  // 2. Check which lines already have KDS ticket items
  const lineIds = lines.map((l) => l.id);
  const existingTicketItems = await withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ orderLineId: fnbKitchenTicketItems.orderLineId })
      .from(fnbKitchenTicketItems)
      .where(
        and(
          eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
          inArray(fnbKitchenTicketItems.orderLineId, lineIds),
        ),
      ),
  );

  const alreadySentIds = new Set(
    (existingTicketItems as Array<{ orderLineId: string }>).map((r) => r.orderLineId),
  );

  const newLines = lines.filter((l) => !alreadySentIds.has(l.id));
  if (!newLines.length) {
    logger.debug('[kds] sendOrderLinesToKds: all lines already sent', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, totalLines: lines.length,
      alreadySent: alreadySentIds.size,
    });
    return { sentCount: 0, failedCount: 0, totalStations: 0 };
  }

  logger.info('[kds] sendOrderLinesToKds: routing new lines', {
    domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
    newLineCount: newLines.length, alreadySent: alreadySentIds.size,
  });

  // 3. Resolve effective KDS location (site↔venue hierarchy fallback)
  const effectiveLocationId = await resolveKdsLocationId(ctx.tenantId, ctx.locationId!);

  // 4. Build routable items and enrich with catalog hierarchy
  let routableItems: RoutableItem[] = newLines.map((line) => ({
    orderLineId: line.id,
    catalogItemId: line.catalogItemId,
    subDepartmentId: line.subDepartmentId ?? null,
    modifierIds: extractModifierIds(line.modifiers),
  }));

  routableItems = await enrichRoutableItems(ctx.tenantId, routableItems);

  // 5. Bulk-resolve stations using the effective location
  const routingResults = await resolveStationRouting(
    { tenantId: ctx.tenantId, locationId: effectiveLocationId, orderType, channel: 'pos' },
    routableItems,
  );

  // Log unrouted items
  const unrouted = routingResults.filter((r) => !r.stationId);
  if (unrouted.length > 0) {
    logger.warn('[kds] sendOrderLinesToKds: unroutable items', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
      unroutedCount: unrouted.length, totalLines: newLines.length,
    });
  }

  // 5. Group routed items by station
  const lineMap = new Map(newLines.map((l) => [l.id, l]));

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
    logger.warn('[kds] sendOrderLinesToKds: no stations resolved — no tickets created', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
    });
    return { sentCount: 0, failedCount: 0, totalStations: 0 };
  }

  // 6a. Pre-fetch station names for send tracking (non-critical, batch query)
  const stationNameMap = new Map<string, string>();
  try {
    const stationIds = Array.from(stationGroups.keys());
    const stationNameRows = await withTenant(ctx.tenantId, (tx) =>
      tx.execute(sql`
        SELECT id, display_name FROM fnb_kitchen_stations
        WHERE tenant_id = ${ctx.tenantId} AND id IN (${sql.join(stationIds.map((id) => sql`${id}`), sql`, `)})
      `),
    );
    for (const row of Array.from(stationNameRows as Iterable<Record<string, unknown>>)) {
      stationNameMap.set(row.id as string, (row.display_name as string) ?? 'Unknown');
    }
  } catch (err) {
    logger.warn('[kds] sendOrderLinesToKds: station name prefetch failed — using IDs as fallback', {
      domain: 'kds', tenantId: ctx.tenantId, orderId,
      stationIds: Array.from(stationGroups.keys()),
      error: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  // 6. Create one ticket per station (serial to avoid pool exhaustion — gotcha #466)
  // No in-request retry — sleep() inside Vercel request handlers freezes the event loop
  // and worsens pool exhaustion. The transactional outbox handles retries for transient failures.
  // Use the effective location for ticket creation so tickets are visible at the correct KDS location
  const effectiveCtx = effectiveLocationId !== ctx.locationId
    ? { ...ctx, locationId: effectiveLocationId } as RequestContext
    : ctx;
  let actualSentCount = 0;
  const failedStations: string[] = [];
  for (const [stationId, ticketItems] of stationGroups) {
    const sortedLineIds = ticketItems.map((i) => i.orderLineId).sort().join(',');
    try {
      const ticket = await createKitchenTicket(effectiveCtx, {
        clientRequestId: `retail-kds-send-${orderId}-${stationId}-${sortedLineIds}`,
        orderId,
        businessDate,
        orderType,
        channel: 'pos',
        items: ticketItems,
      });
      actualSentCount += ticketItems.length;

      // Record send tracking (non-critical — failures don't block ticket creation)
      try {
        const sendToken = `retail-send-${ticket.id}-${stationId}`;
        const tracked = await recordKdsSend({
          tenantId: ctx.tenantId,
          locationId: effectiveLocationId,
          orderId,
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          courseId: undefined,
          courseNumber: ticket.courseNumber ?? undefined,
          stationId,
          stationName: stationNameMap.get(stationId) ?? stationId,
          employeeId: ctx.user.id,
          employeeName: ctx.user.name,
          sendToken,
          sendType: 'initial',
          routingReason: 'routing_rule',
          itemCount: ticketItems.length,
          orderType: ticket.orderType ?? orderType,
          businessDate,
        });
        await markKdsSendSent(ctx.tenantId, tracked.sendToken);
      } catch (trackErr) {
        logger.warn('[kds] send tracking failed (non-critical)', {
          domain: 'kds', tenantId: ctx.tenantId, ticketId: ticket.id, stationId,
          error: { message: trackErr instanceof Error ? trackErr.message : String(trackErr) },
        });
      }
    } catch (err) {
      logger.error('[kds] sendOrderLinesToKds: failed to create ticket for station', {
        domain: 'kds', tenantId: ctx.tenantId, orderId, stationId, locationId: ctx.locationId,
        itemCount: ticketItems.length,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
      failedStations.push(stationId);
      // Track the failure (non-critical)
      try {
        const failToken = `retail-fail-${orderId}-${stationId}`;
        const tracked = await recordKdsSend({
          tenantId: ctx.tenantId,
          locationId: effectiveLocationId,
          orderId,
          ticketId: `unresolved-${orderId}`,
          ticketNumber: 0,
          stationId,
          stationName: stationNameMap.get(stationId) ?? stationId,
          employeeId: ctx.user.id,
          employeeName: ctx.user.name,
          sendToken: failToken,
          sendType: 'initial',
          routingReason: 'routing_rule',
          itemCount: ticketItems.length,
          businessDate,
        });
        await markKdsSendFailed(ctx.tenantId, tracked.sendToken, 'TICKET_CREATION_FAILED', 'Ticket creation failed');
      } catch (failTrackErr) {
        logger.warn('[kds] failure tracking also failed (non-critical)', {
          domain: 'kds', tenantId: ctx.tenantId, orderId, stationId,
          error: { message: failTrackErr instanceof Error ? failTrackErr.message : String(failTrackErr) },
        });
      }
    }
  }

  return {
    sentCount: actualSentCount,
    failedCount: failedStations.length,
    totalStations: stationGroups.size,
  };
}

