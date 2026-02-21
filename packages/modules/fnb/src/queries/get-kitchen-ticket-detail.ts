import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetKitchenTicketDetailInput } from '../validation';
import { TicketNotFoundError } from '../errors';

export interface TicketItemDetail {
  id: string;
  orderLineId: string;
  itemStatus: string;
  stationId: string | null;
  itemName: string;
  modifierSummary: string | null;
  specialInstructions: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  voidedAt: string | null;
}

export interface DeltaChitDetail {
  id: string;
  deltaType: string;
  orderLineId: string;
  itemName: string;
  modifierSummary: string | null;
  seatNumber: number | null;
  quantity: number | null;
  reason: string | null;
  stationId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface KitchenTicketDetail {
  id: string;
  ticketNumber: number;
  tabId: string;
  orderId: string;
  courseNumber: number | null;
  status: string;
  businessDate: string;
  sentAt: string;
  sentBy: string;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  voidedAt: string | null;
  tableNumber: number | null;
  serverName: string | null;
  version: number;
  items: TicketItemDetail[];
  deltaChits: DeltaChitDetail[];
}

export async function getKitchenTicketDetail(
  input: GetKitchenTicketDetailInput,
): Promise<KitchenTicketDetail> {
  return withTenant(input.tenantId, async (tx) => {
    const ticketRows = await tx.execute(
      sql`SELECT id, ticket_number, tab_id, order_id, course_number,
                 status, business_date, sent_at, sent_by, started_at,
                 ready_at, served_at, voided_at, table_number, server_name, version
          FROM fnb_kitchen_tickets
          WHERE id = ${input.ticketId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );

    const ticketArr = Array.from(ticketRows as Iterable<Record<string, unknown>>);
    if (ticketArr.length === 0) throw new TicketNotFoundError(input.ticketId);
    const t = ticketArr[0]!;

    // Get items
    const itemRows = await tx.execute(
      sql`SELECT id, order_line_id, item_status, station_id, item_name,
                 modifier_summary, special_instructions, seat_number, course_name,
                 quantity, is_rush, is_allergy, is_vip,
                 started_at, ready_at, served_at, voided_at
          FROM fnb_kitchen_ticket_items
          WHERE ticket_id = ${input.ticketId} AND tenant_id = ${input.tenantId}
          ORDER BY seat_number NULLS LAST, id ASC`,
    );
    const items = Array.from(itemRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      orderLineId: r.order_line_id as string,
      itemStatus: r.item_status as string,
      stationId: (r.station_id as string) ?? null,
      itemName: r.item_name as string,
      modifierSummary: (r.modifier_summary as string) ?? null,
      specialInstructions: (r.special_instructions as string) ?? null,
      seatNumber: r.seat_number != null ? Number(r.seat_number) : null,
      courseName: (r.course_name as string) ?? null,
      quantity: Number(r.quantity),
      isRush: r.is_rush as boolean,
      isAllergy: r.is_allergy as boolean,
      isVip: r.is_vip as boolean,
      startedAt: (r.started_at as string) ?? null,
      readyAt: (r.ready_at as string) ?? null,
      servedAt: (r.served_at as string) ?? null,
      voidedAt: (r.voided_at as string) ?? null,
    }));

    // Get delta chits
    const chitRows = await tx.execute(
      sql`SELECT id, delta_type, order_line_id, item_name, modifier_summary,
                 seat_number, quantity, reason, station_id, created_by, created_at
          FROM fnb_kitchen_delta_chits
          WHERE ticket_id = ${input.ticketId} AND tenant_id = ${input.tenantId}
          ORDER BY created_at DESC`,
    );
    const deltaChits = Array.from(chitRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      deltaType: r.delta_type as string,
      orderLineId: r.order_line_id as string,
      itemName: r.item_name as string,
      modifierSummary: (r.modifier_summary as string) ?? null,
      seatNumber: r.seat_number != null ? Number(r.seat_number) : null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      reason: (r.reason as string) ?? null,
      stationId: (r.station_id as string) ?? null,
      createdBy: r.created_by as string,
      createdAt: r.created_at as string,
    }));

    return {
      id: t.id as string,
      ticketNumber: Number(t.ticket_number),
      tabId: t.tab_id as string,
      orderId: t.order_id as string,
      courseNumber: t.course_number != null ? Number(t.course_number) : null,
      status: t.status as string,
      businessDate: t.business_date as string,
      sentAt: t.sent_at as string,
      sentBy: t.sent_by as string,
      startedAt: (t.started_at as string) ?? null,
      readyAt: (t.ready_at as string) ?? null,
      servedAt: (t.served_at as string) ?? null,
      voidedAt: (t.voided_at as string) ?? null,
      tableNumber: t.table_number != null ? Number(t.table_number) : null,
      serverName: (t.server_name as string) ?? null,
      version: Number(t.version),
      items,
      deltaChits,
    };
  });
}
