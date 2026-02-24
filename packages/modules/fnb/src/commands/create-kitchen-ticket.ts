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

export async function createKitchenTicket(
  ctx: RequestContext,
  input: CreateKitchenTicketInput,
) {
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

    // Create the ticket
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
        version: 1,
      })
      .returning();

    // Create ticket items
    for (const item of input.items) {
      await (tx as any)
        .insert(fnbKitchenTicketItems)
        .values({
          tenantId: ctx.tenantId,
          ticketId: ticket!.id,
          orderLineId: item.orderLineId,
          itemStatus: 'pending',
          stationId: item.stationId ?? null,
          itemName: item.itemName,
          modifierSummary: item.modifierSummary ?? null,
          specialInstructions: item.specialInstructions ?? null,
          seatNumber: item.seatNumber ?? null,
          courseName: item.courseName ?? null,
          quantity: String(item.quantity ?? 1),
          isRush: item.isRush ?? false,
          isAllergy: item.isAllergy ?? false,
          isVip: item.isVip ?? false,
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
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createKitchenTicket', ticket);

    return { result: ticket!, events: [event] };
  });

  await auditLog(ctx, 'fnb.ticket.created', 'fnb_kitchen_tickets', result.id, undefined, {
    tabId: input.tabId,
    itemCount: input.items.length,
  });

  return result;
}
