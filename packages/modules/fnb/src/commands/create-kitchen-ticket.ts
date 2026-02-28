import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKitchenTickets, fnbKitchenTicketItems, fnbTabs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateKitchenTicketInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError } from '../errors';
import { resolveStationRouting, getStationPrepTimeForItem } from '../services/kds-routing-engine';
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

  // ── Pre-transaction: resolve prep times for routed items ──
  const prepTimeMap = new Map<string, number>();
  const prepTimeLookups: Array<{ orderLineId: string; catalogItemId: string; stationId: string }> = [];

  for (const item of input.items) {
    const stationId = item.stationId ?? routingMap.get(item.orderLineId)?.stationId;
    if (stationId && item.catalogItemId) {
      prepTimeLookups.push({ orderLineId: item.orderLineId, catalogItemId: item.catalogItemId, stationId });
    }
  }

  if (prepTimeLookups.length > 0) {
    const results = await Promise.all(
      prepTimeLookups.map(async (lookup) => {
        const seconds = await getStationPrepTimeForItem(ctx.tenantId, lookup.catalogItemId, lookup.stationId);
        return { orderLineId: lookup.orderLineId, seconds };
      }),
    );
    for (const r of results) {
      if (r.seconds !== null) {
        prepTimeMap.set(r.orderLineId, r.seconds);
      }
    }
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createKitchenTicket',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate tab
    const [tab] = await (tx as any)
      .select()
      .from(fnbTabs)
      .where(and(
        eq(fnbTabs.id, input.tabId),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!tab) throw new TabNotFoundError(input.tabId);

    // Get next ticket number
    const counterResult = await (tx as any).execute(
      sql`INSERT INTO fnb_kitchen_ticket_counters (tenant_id, location_id, business_date, last_number)
          VALUES (${ctx.tenantId}, ${ctx.locationId}, ${tab.businessDate}, 1)
          ON CONFLICT (tenant_id, location_id, business_date)
          DO UPDATE SET last_number = fnb_kitchen_ticket_counters.last_number + 1
          RETURNING last_number`,
    );
    const ticketNumber = Number(
      Array.from(counterResult as Iterable<Record<string, unknown>>)[0]!.last_number,
    );

    // Compute estimatedPickupAt from the max prep time across all items
    let estimatedPickupAt: Date | null = null;
    if (prepTimeMap.size > 0) {
      const maxPrepSeconds = Math.max(...prepTimeMap.values());
      if (maxPrepSeconds > 0) {
        estimatedPickupAt = new Date(Date.now() + maxPrepSeconds * 1000);
      }
    }

    // Create the ticket with enhanced fields
    const [ticket] = await (tx as any)
      .insert(fnbKitchenTickets)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        tabId: input.tabId,
        orderId: input.orderId,
        ticketNumber,
        courseNumber: input.courseNumber ?? null,
        status: 'pending',
        businessDate: tab.businessDate,
        sentBy: ctx.user.id,
        tableNumber: tab.tableId ? undefined : null,
        serverName: undefined,
        priorityLevel: input.priorityLevel ?? 0,
        orderType: input.orderType ?? null,
        channel: input.channel ?? null,
        customerName: input.customerName ?? null,
        estimatedPickupAt,
        version: 1,
      })
      .returning();

    // Create ticket items with routing + prep time data
    for (const item of input.items) {
      const routing = routingMap.get(item.orderLineId);
      const resolvedStationId = item.stationId ?? routing?.stationId ?? null;
      const resolvedRoutingRuleId = routing?.routingRuleId ?? null;
      const resolvedPrepSeconds = prepTimeMap.get(item.orderLineId) ?? null;

      await (tx as any)
        .insert(fnbKitchenTicketItems)
        .values({
          tenantId: ctx.tenantId,
          ticketId: ticket!.id,
          orderLineId: item.orderLineId,
          itemStatus: 'pending',
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
        });
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TICKET_CREATED, {
      ticketId: ticket!.id,
      locationId: ctx.locationId,
      tabId: input.tabId,
      orderId: input.orderId,
      ticketNumber,
      itemCount: input.items.length,
      businessDate: tab.businessDate,
      priorityLevel: input.priorityLevel ?? 0,
      orderType: input.orderType,
      channel: input.channel,
      routedItemCount: routingResults.filter((r) => r.stationId !== null).length,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createKitchenTicket', ticket);

    return { result: ticket!, events: [event] };
  });

  await auditLog(ctx, 'fnb.ticket.created', 'fnb_kitchen_tickets', result.id, undefined, {
    tabId: input.tabId,
    itemCount: input.items.length,
    routedItemCount: routingResults.filter((r) => r.stationId !== null).length,
  });

  return result;
}
