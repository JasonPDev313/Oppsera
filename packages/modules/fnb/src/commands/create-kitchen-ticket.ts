import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTickets, fnbKitchenTicketItems, fnbTabs, fnbTables } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateKitchenTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError } from '../errors';
import { resolveStationRouting, getStationPrepTimesForItems } from '../services/kds-routing-engine';
import type { RoutableItem, RoutingResult } from '../services/kds-routing-engine';

export async function createKitchenTicket(
  ctx: RequestContext,
  input: CreateKitchenTicketInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to create a kitchen ticket');
  }

  // ── Pre-transaction: resolve routing for items without explicit stationId ──
  // Per gotcha #123: read-only data fetching happens OUTSIDE the transaction
  // to avoid lock contention and N serial DB round-trips.
  let routingResults: RoutingResult[] = [];
  const itemsNeedingRouting = input.items.filter(
    (item) => !item.stationId && item.catalogItemId,
  );

  if (itemsNeedingRouting.length > 0 && ctx.locationId) {
    const routableItems: RoutableItem[] = itemsNeedingRouting.map((item) => ({
      orderLineId: item.orderLineId,
      catalogItemId: item.catalogItemId!,
      departmentId: item.departmentId ?? null,
      subDepartmentId: item.subDepartmentId ?? null,
      categoryId: item.categoryId ?? null,
      modifierIds: item.modifierIds,
    }));

    routingResults = await resolveStationRouting(
      {
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        orderType: input.orderType,
        channel: input.channel,
      },
      routableItems,
    );
  }

  // Build a lookup map: orderLineId → routing result
  const routingMap = new Map<string, RoutingResult>();
  for (const r of routingResults) {
    routingMap.set(r.orderLineId, r);
  }

  // ── Pre-transaction: resolve prep times for routed items (batched) ──
  // Single DB round-trip instead of N individual queries.
  const prepTimeLookups: Array<{ orderLineId: string; catalogItemId: string; stationId: string }> = [];

  for (const item of input.items) {
    const stationId = item.stationId ?? routingMap.get(item.orderLineId)?.stationId;
    if (stationId && item.catalogItemId) {
      prepTimeLookups.push({ orderLineId: item.orderLineId, catalogItemId: item.catalogItemId, stationId });
    }
  }

  const prepTimeMap = await getStationPrepTimesForItems(ctx.tenantId, prepTimeLookups);

  // Defense-in-depth: warn if a single ticket has items for multiple stations
  const resolvedStationIds = new Set<string>();
  for (const item of input.items) {
    const sid = item.stationId ?? routingMap.get(item.orderLineId)?.stationId;
    if (sid) resolvedStationIds.add(sid);
  }
  if (resolvedStationIds.size > 1) {
    logger.warn('[kds] createKitchenTicket: ticket has items for multiple stations — callers should group by station', {
      domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
      stationIds: Array.from(resolvedStationIds), itemCount: input.items.length,
    });
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createKitchenTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      logger.info('[kds] createKitchenTicket idempotency dedup — skipped duplicate', {
        domain: 'kds',
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        clientRequestId: input.clientRequestId,
        tabId: input.tabId,
        orderId: input.orderId,
      });
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Validate tab (when present — retail orders have no tab)
    let tab: Record<string, unknown> | null = null;
    let resolvedTableNumber: number | null = null;
    if (input.tabId) {
      const [found] = await tx
        .select()
        .from(fnbTabs)
        .where(and(
          eq(fnbTabs.id, input.tabId),
          eq(fnbTabs.tenantId, ctx.tenantId),
        ))
        .limit(1);
      if (!found) throw new TabNotFoundError(input.tabId);
      tab = found;

      // Look up the table's display number for the KDS ticket
      if (tab.tableId) {
        const [tableRow] = await tx
          .select({ tableNumber: fnbTables.tableNumber })
          .from(fnbTables)
          .where(eq(fnbTables.id, tab.tableId as string))
          .limit(1);
        resolvedTableNumber = tableRow?.tableNumber ?? null;
      }
    }

    const resolvedBusinessDate = tab?.businessDate as string | undefined ?? input.businessDate;
    if (!resolvedBusinessDate) {
      throw new Error('businessDate is required when tabId is not provided');
    }

    // Get next ticket number
    const counterResult = await tx.execute(
      sql`INSERT INTO fnb_kitchen_ticket_counters (tenant_id, location_id, business_date, last_number)
          VALUES (${ctx.tenantId}, ${ctx.locationId}, ${resolvedBusinessDate}, 1)
          ON CONFLICT (tenant_id, location_id, business_date)
          DO UPDATE SET last_number = fnb_kitchen_ticket_counters.last_number + 1
          RETURNING last_number`,
    );
    const counterRow = Array.from(counterResult as Iterable<Record<string, unknown>>)[0];
    if (!counterRow) {
      throw new Error('Failed to increment ticket counter — no row returned from UPSERT RETURNING');
    }
    const ticketNumber = Number(counterRow.last_number);

    // Compute estimatedPickupAt from the max prep time across all items
    let estimatedPickupAt: Date | null = null;
    if (prepTimeMap.size > 0) {
      let maxPrepSeconds = 0;
      for (const seconds of prepTimeMap.values()) {
        if (seconds > maxPrepSeconds) maxPrepSeconds = seconds;
      }
      if (maxPrepSeconds > 0) {
        estimatedPickupAt = new Date(Date.now() + maxPrepSeconds * 1000);
      }
    }

    // Create the ticket with enhanced fields
    const [ticket] = await tx
      .insert(fnbKitchenTickets)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        tabId: input.tabId ?? null,
        orderId: input.orderId ?? null,
        ticketNumber,
        courseNumber: input.courseNumber ?? null,
        status: 'pending',
        businessDate: resolvedBusinessDate,
        sentBy: ctx.user.id,
        tableNumber: resolvedTableNumber,
        serverName: null, // TODO: look up from users table via serverUserId
        priorityLevel: input.priorityLevel ?? 0,
        orderType: input.orderType ?? null,
        channel: input.channel ?? null,
        customerName: input.customerName ?? null,
        estimatedPickupAt,
        version: 1,
      })
      .returning();

    // Create ticket items — bulk insert (single round-trip instead of N serial inserts)
    if (input.items.length > 0) {
      await tx
        .insert(fnbKitchenTicketItems)
        .values(
          input.items.map((item) => {
            const routing = routingMap.get(item.orderLineId);
            const resolvedStationId = item.stationId ?? routing?.stationId ?? null;
            const resolvedRoutingRuleId = routing?.routingRuleId ?? null;
            const resolvedPrepSeconds = prepTimeMap.get(item.orderLineId) ?? null;

            return {
              tenantId: ctx.tenantId,
              ticketId: ticket!.id,
              orderLineId: item.orderLineId,
              itemStatus: 'pending' as const,
              stationId: resolvedStationId,
              itemName: item.kitchenLabel ?? item.itemName,
              modifierSummary: item.modifierSummary ?? null,
              specialInstructions: item.specialInstructions ?? null,
              seatNumber: item.seatNumber ?? null,
              courseName: item.courseName ?? null,
              quantity: String(item.quantity ?? 1),
              isRush: item.isRush ?? false,
              isAllergy: item.isAllergy ?? false,
              isVip: item.isVip ?? false,
              routingRuleId: resolvedRoutingRuleId,
              kitchenLabel: item.kitchenLabel ?? null,
              itemColor: item.itemColor ?? null,
              priorityLevel: input.priorityLevel ?? 0,
              estimatedPrepSeconds: resolvedPrepSeconds,
            };
          }),
        );
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_CREATED, {
      ticketId: ticket!.id,
      locationId: ctx.locationId,
      tabId: input.tabId ?? null,
      orderId: input.orderId ?? null,
      ticketNumber,
      itemCount: input.items.length,
      businessDate: resolvedBusinessDate,
      priorityLevel: input.priorityLevel ?? 0,
      orderType: input.orderType,
      channel: input.channel,
      routedItemCount: routingResults.filter((r) => r.stationId !== null).length,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createKitchenTicket', ticket);

    return { result: ticket!, events: [event] };
  });

  logger.info('[kds] kitchen ticket created', {
    domain: 'kds',
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    ticketId: result.id,
    tabId: input.tabId,
    orderId: input.orderId,
    courseNumber: input.courseNumber,
    itemCount: input.items.length,
    routedItemCount: routingResults.filter((r) => r.stationId !== null).length,
    unroutedItemCount: routingResults.filter((r) => r.stationId === null).length,
    orderType: input.orderType,
    channel: input.channel,
    prepTimeCount: prepTimeMap.size,
    clientRequestId: input.clientRequestId,
  });

  auditLogDeferred(ctx, 'fnb.ticket.created', 'fnb_kitchen_tickets', result.id, undefined, {
    tabId: input.tabId,
    itemCount: input.items.length,
    routedItemCount: routingResults.filter((r) => r.stationId !== null).length,
  });

  return result;
}
