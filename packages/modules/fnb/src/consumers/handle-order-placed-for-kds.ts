import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orderLines } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared/types/events';
import type { RequestContext } from '@oppsera/core/auth/context';
import { resolveStationRouting } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { createKitchenTicket } from '../commands/create-kitchen-ticket';

const KDS_ITEM_TYPES = ['food', 'beverage'];

/**
 * Consumer: handles order.placed.v1 for retail POS → KDS ticket creation.
 *
 * When a retail order is placed (no FnB tab), this consumer:
 * 1. Fetches order lines filtered to food/beverage
 * 2. Bulk-resolves KDS stations via the routing engine (2 queries)
 * 3. Groups items by station, creates tickets in parallel
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
  };

  if (!data.orderId || !data.locationId) return;

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

    if (!lines.length) return;

    // 2. Bulk-resolve stations — single query for rules + single for fallback
    //    stations (vs N×3 sequential queries with resolveStation).
    //    Also doubles as station-existence check: all nulls = no stations.
    const routableItems: RoutableItem[] = lines.map((line) => ({
      orderLineId: line.id,
      catalogItemId: line.catalogItemId,
      subDepartmentId: line.subDepartmentId ?? null,
    }));

    const routingResults = await resolveStationRouting(
      { tenantId: event.tenantId, locationId: data.locationId },
      routableItems,
    );

    // 3. Build a line lookup and group routed items by station
    const lineMap = new Map(lines.map((l) => [l.id, l]));

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

    if (stationGroups.size === 0) return;

    // 4. Create one ticket per station — parallel since they're independent
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

    await Promise.all(
      Array.from(stationGroups, ([stationId, ticketItems]) =>
        createKitchenTicket(syntheticCtx, {
          clientRequestId: `retail-kds-${data.orderId}-${stationId}`,
          orderId: data.orderId,
          businessDate: data.businessDate,
          channel: 'pos',
          customerName: data.customerName ?? undefined,
          items: ticketItems,
        }).catch((err) => {
          console.warn(
            `[handleOrderPlacedForKds] Failed to create ticket for station ${stationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      ),
    );
  } catch (err) {
    // Consumer must never throw
    console.error(
      `[handleOrderPlacedForKds] Unhandled error for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Formats the JSONB modifiers array into a human-readable summary string. */
function formatModifierSummary(modifiers: unknown): string | null {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null;

  const parts: string[] = [];
  for (const mod of modifiers) {
    if (typeof mod === 'object' && mod !== null) {
      const m = mod as Record<string, unknown>;
      const name = String(m.name ?? m.modifierName ?? m.label ?? '');
      if (name) parts.push(name);
    } else if (typeof mod === 'string') {
      parts.push(mod);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}
