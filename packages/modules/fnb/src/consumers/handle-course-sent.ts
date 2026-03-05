import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbTabs, fnbTabItems, fnbTabCourses } from '@oppsera/db';
import { resolveStationRouting, enrichRoutableItems } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { createKitchenTicket } from '../commands/create-kitchen-ticket';
import type { RequestContext } from '@oppsera/core/auth/context';

export interface CourseSentConsumerData {
  tabId: string;
  locationId: string;
  courseNumber: number;
}

/**
 * Consumer: handles fnb.course.sent.v1 and fnb.course.fired.v1 events.
 *
 * When a course is sent or fired, this consumer:
 * 1. Fetches the tab + course name + items in parallel
 * 2. Enriches items with catalog hierarchy + modifierIds
 * 3. Bulk-resolves KDS stations via the routing engine (with conditions)
 * 4. Groups items by station
 * 5. Creates one kitchen ticket per station (in parallel)
 *
 * Idempotent via deterministic clientRequestId per tab+course+station.
 * Never throws — logs errors and continues (fire-and-forget consumer pattern).
 */
export async function handleCourseSent(
  tenantId: string,
  data: CourseSentConsumerData,
): Promise<void> {
  try {
    // 1–3. Fetch tab, course name, and items in PARALLEL — all depend only on
    // data.tabId / data.courseNumber which are available upfront. Eliminates
    // 3 sequential withTenant round-trips.
    const [tabResult, courseResult, items] = await Promise.all([
      withTenant(tenantId, (tx) =>
        tx
          .select({
            id: fnbTabs.id,
            locationId: fnbTabs.locationId,
            primaryOrderId: fnbTabs.primaryOrderId,
            businessDate: fnbTabs.businessDate,
            tableId: fnbTabs.tableId,
            tabType: fnbTabs.tabType,
          })
          .from(fnbTabs)
          .where(
            and(
              eq(fnbTabs.id, data.tabId),
              eq(fnbTabs.tenantId, tenantId),
            ),
          )
          .limit(1),
      ),
      withTenant(tenantId, (tx) =>
        tx
          .select({ courseName: fnbTabCourses.courseName })
          .from(fnbTabCourses)
          .where(
            and(
              eq(fnbTabCourses.tabId, data.tabId),
              eq(fnbTabCourses.courseNumber, data.courseNumber),
            ),
          )
          .limit(1),
      ),
      withTenant(tenantId, (tx) =>
        tx
          .select({
            id: fnbTabItems.id,
            catalogItemId: fnbTabItems.catalogItemId,
            catalogItemName: fnbTabItems.catalogItemName,
            seatNumber: fnbTabItems.seatNumber,
            qty: fnbTabItems.qty,
            modifiers: fnbTabItems.modifiers,
            subDepartmentId: fnbTabItems.subDepartmentId,
            specialInstructions: fnbTabItems.specialInstructions,
          })
          .from(fnbTabItems)
          .where(
            and(
              eq(fnbTabItems.tenantId, tenantId),
              eq(fnbTabItems.tabId, data.tabId),
              eq(fnbTabItems.courseNumber, data.courseNumber),
              inArray(fnbTabItems.status, ['draft', 'sent', 'fired']),
            ),
          ),
      ),
    ]);

    const tab = tabResult[0];
    const courseName = courseResult[0]?.courseName ?? `Course ${data.courseNumber}`;

    if (!tab) {
      console.warn(`[handleCourseSent] Tab not found: ${data.tabId}`);
      return;
    }

    // primaryOrderId may be null — the order is created at prepare-check (payment time).
    // KDS tickets are created regardless; orderId is backfilled when the check is prepared.

    const locationId = data.locationId || tab.locationId;

    if (!items.length) {
      console.warn(`[handleCourseSent] No items for tab ${data.tabId} course ${data.courseNumber}`);
      return;
    }

    // 4. Build routable items with modifierIds extracted from JSONB
    let routableItems: RoutableItem[] = items.map((item) => ({
      orderLineId: item.id,
      catalogItemId: item.catalogItemId,
      subDepartmentId: item.subDepartmentId ?? null,
      modifierIds: extractModifierIds(item.modifiers),
    }));

    // 5. Enrich with categoryId + departmentId from catalog hierarchy
    routableItems = await enrichRoutableItems(tenantId, routableItems);

    // 6. Bulk-resolve stations with full context (order type from tab, channel = pos)
    const routingResults = await resolveStationRouting(
      {
        tenantId,
        locationId,
        orderType: tab.tabType ?? undefined,
        channel: 'pos',
      },
      routableItems,
    );

    // Log items that couldn't be routed
    const unrouted = routingResults.filter((r) => !r.stationId);
    if (unrouted.length > 0) {
      console.warn(
        `[handleCourseSent] ${unrouted.length} item(s) could not be routed to any KDS station for tab ${data.tabId} course ${data.courseNumber}`,
      );
    }

    // 7. Group routed items by station
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const stationGroups = new Map<string, Array<{
      orderLineId: string;
      itemName: string;
      modifierSummary?: string;
      specialInstructions?: string;
      seatNumber?: number;
      courseName: string;
      quantity: number;
      stationId: string;
    }>>();

    for (const r of routingResults) {
      if (!r.stationId) continue;
      const item = itemMap.get(r.orderLineId);
      if (!item) continue;

      const group = stationGroups.get(r.stationId) ?? [];
      group.push({
        orderLineId: item.id,
        itemName: item.catalogItemName,
        modifierSummary: formatModifierSummary(item.modifiers) ?? undefined,
        specialInstructions: item.specialInstructions ?? undefined,
        seatNumber: item.seatNumber ?? undefined,
        courseName,
        quantity: Number(item.qty) || 1,
        stationId: r.stationId,
      });
      stationGroups.set(r.stationId, group);
    }

    if (stationGroups.size === 0) {
      console.warn(`[handleCourseSent] No stations resolved for tab ${data.tabId} course ${data.courseNumber}`);
      return;
    }

    // 8. Create one kitchen ticket per station — in PARALLEL.
    // Each ticket has a deterministic idempotency key (tab+course+station),
    // so concurrent execution is safe and won't create duplicates.
    const syntheticCtx = {
      tenantId,
      locationId,
      user: { id: 'system', email: 'system@oppsera.com', role: 'system' },
      requestId: `kds-consumer-${data.tabId}-${data.courseNumber}`,
      isPlatformAdmin: false,
    } as unknown as RequestContext;

    await Promise.allSettled(
      [...stationGroups].map(([stationId, ticketItems]) => {
        const clientRequestId = `kds-course-${data.tabId}-${data.courseNumber}-${stationId}`;
        return createKitchenTicket(syntheticCtx, {
          clientRequestId,
          tabId: data.tabId,
          orderId: tab.primaryOrderId ?? undefined,
          courseNumber: data.courseNumber,
          orderType: tab.tabType ?? undefined,
          channel: 'pos',
          items: ticketItems,
        }).catch((err) => {
          // Log but don't throw — idempotency duplicate is expected on replay
          console.warn(
            `[handleCourseSent] Failed to create ticket for station ${stationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }),
    );
  } catch (err) {
    // Consumer must never throw
    console.error(
      `[handleCourseSent] Unhandled error for tab ${data.tabId} course ${data.courseNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
