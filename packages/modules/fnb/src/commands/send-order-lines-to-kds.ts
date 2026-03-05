import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orderLines, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { resolveStationRouting, enrichRoutableItems } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { createKitchenTicket } from './create-kitchen-ticket';

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
): Promise<{ sentCount: number }> {
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

  if (!lines.length) return { sentCount: 0 };

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
  if (!newLines.length) return { sentCount: 0 };

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
    console.warn(
      `[sendOrderLinesToKds] ${unrouted.length} item(s) could not be routed to any KDS station for order ${orderId}`,
    );
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

  if (stationGroups.size === 0) return { sentCount: 0 };

  // 6. Create one ticket per station (serial to avoid pool exhaustion)
  // Use line-based idempotency: key includes sorted line IDs so re-sends are safe
  for (const [stationId, ticketItems] of stationGroups) {
    const sortedLineIds = ticketItems.map((i) => i.orderLineId).sort().join(',');
    try {
      await createKitchenTicket(ctx, {
        clientRequestId: `retail-kds-send-${orderId}-${stationId}-${sortedLineIds}`,
        orderId,
        businessDate,
        channel: 'pos',
        items: ticketItems,
      });
    } catch (err) {
      console.warn(
        `[sendOrderLinesToKds] Failed to create ticket for station ${stationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { sentCount: newLines.length };
}

/** Extract modifier IDs from the JSONB modifiers array. */
function extractModifierIds(modifiers: unknown): string[] {
  if (!Array.isArray(modifiers)) return [];
  const ids: string[] = [];
  for (const mod of modifiers) {
    if (typeof mod === 'object' && mod !== null) {
      const m = mod as Record<string, unknown>;
      const id = m.modifierId as string | undefined;
      if (id) ids.push(id);
    }
  }
  return ids;
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
