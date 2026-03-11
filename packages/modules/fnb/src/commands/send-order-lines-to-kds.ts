import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orderLines, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems } from '../services/kds-routing-engine';
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

  // 3. Build routable items and enrich with catalog hierarchy
  let routableItems: RoutableItem[] = newLines.map((line) => ({
    orderLineId: line.id,
    catalogItemId: line.catalogItemId,
    subDepartmentId: line.subDepartmentId ?? null,
    modifierIds: extractModifierIds(line.modifiers),
  }));

  routableItems = await enrichRoutableItems(ctx.tenantId, routableItems);

  // 4. Bulk-resolve stations
  const routingResults = await resolveStationRouting(
    { tenantId: ctx.tenantId, locationId: ctx.locationId, channel: 'pos' },
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
  } catch {
    // Non-critical — send tracking will use fallback names
  }

  // 6. Create one ticket per station (serial to avoid pool exhaustion)
  // Use line-based idempotency: key includes sorted line IDs so re-sends are safe
  // Retry up to 3x with exponential backoff on transient errors (pool exhaustion, timeouts)
  let actualSentCount = 0;
  const failedStations: string[] = [];
  for (const [stationId, ticketItems] of stationGroups) {
    const sortedLineIds = ticketItems.map((i) => i.orderLineId).sort().join(',');
    let sent = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ticket = await createKitchenTicket(ctx, {
          clientRequestId: `retail-kds-send-${orderId}-${stationId}-${sortedLineIds}`,
          orderId,
          businessDate,
          channel: 'pos',
          items: ticketItems,
        });
        actualSentCount += ticketItems.length;
        sent = true;

        // Record send tracking (non-critical — failures don't block ticket creation)
        try {
          const tokenRows = await withTenant(ctx.tenantId, (t) => t.execute(sql`SELECT gen_ulid() AS token`));
          const sendToken = Array.from(tokenRows as Iterable<Record<string, unknown>>)[0]!.token as string;
          const tracked = await recordKdsSend({
            tenantId: ctx.tenantId,
            locationId: ctx.locationId!,
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
            orderType: ticket.orderType ?? undefined,
            businessDate,
          });
          await markKdsSendSent(ctx.tenantId, tracked.sendToken);
        } catch (trackErr) {
          logger.warn('[kds] send tracking failed (non-critical)', {
            domain: 'kds', tenantId: ctx.tenantId, ticketId: ticket.id, stationId,
            error: { message: trackErr instanceof Error ? trackErr.message : String(trackErr) },
          });
        }

        break;
      } catch (err) {
        const isTransient = isTransientError(err);
        if (isTransient && attempt < 3) {
          const delayMs = 500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
          logger.warn('[kds] sendOrderLinesToKds: transient error, retrying', {
            domain: 'kds', tenantId: ctx.tenantId, orderId, stationId,
            attempt, delayMs,
            error: { message: err instanceof Error ? err.message : String(err) },
          });
          await sleep(delayMs);
        } else {
          logger.error('[kds] sendOrderLinesToKds: failed to create ticket for station', {
            domain: 'kds', tenantId: ctx.tenantId, orderId, stationId, locationId: ctx.locationId,
            itemCount: ticketItems.length, attempt, isTransient,
            error: { message: err instanceof Error ? err.message : String(err) },
          });
          break; // Non-transient or final attempt — stop retrying this station
        }
      }
    }
    if (!sent) {
      failedStations.push(stationId);
      // Track the failure (non-critical)
      try {
        const failTokenRows = await withTenant(ctx.tenantId, (t) => t.execute(sql`SELECT gen_ulid() AS token`));
        const failToken = Array.from(failTokenRows as Iterable<Record<string, unknown>>)[0]!.token as string;
        const tracked = await recordKdsSend({
          tenantId: ctx.tenantId,
          locationId: ctx.locationId!,
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
        await markKdsSendFailed(ctx.tenantId, tracked.sendToken, 'TICKET_CREATION_FAILED', 'All retry attempts exhausted');
      } catch {
        // Non-critical
      }
    }
  }

  return {
    sentCount: actualSentCount,
    failedCount: failedStations.length,
    totalStations: stationGroups.size,
  };
}

/** Detect transient errors that are safe to retry (pool exhaustion, timeouts, connection errors). */
function isTransientError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  const code = (err as { code?: string })?.code;
  return (
    code === 'CIRCUIT_BREAKER_OPEN' ||
    code === 'QUEUE_TIMEOUT' ||
    code === 'QUERY_TIMEOUT' ||
    code === '53300' || // postgres too_many_connections
    msg.includes('too many clients') ||
    msg.includes('connection slots') ||
    (msg.includes('timeout') && msg.includes('connect')) ||
    msg.includes('pool') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('circuit breaker')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
