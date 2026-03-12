import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbTabs, fnbTabItems, fnbTabCourses } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { createKitchenTicket } from '../commands/create-kitchen-ticket';
import { recordKdsSend, markKdsSendSent } from '../commands/record-kds-send';
import type { RequestContext } from '@oppsera/core/auth/context';
import { normalizeBusinessDate } from '../helpers/normalize-business-date';

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
 * 5. Creates one kitchen ticket per station (serially)
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
              eq(fnbTabCourses.tenantId, tenantId),
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

    const tabRaw = tabResult[0];
    const courseName = courseResult[0]?.courseName ?? `Course ${data.courseNumber}`;

    if (!tabRaw) {
      logger.warn('[kds] handleCourseSent: tab not found', {
        domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
      });
      return;
    }

    // Normalize businessDate: Drizzle `date()` without `mode: 'string'` returns a JS Date
    // at runtime despite TypeScript inferring `string`. Convert to YYYY-MM-DD to prevent
    // postgres.js serialization issues inside publishWithOutbox transactions.
    const tab = {
      ...tabRaw,
      businessDate: normalizeBusinessDate(tabRaw.businessDate),
    };

    // primaryOrderId may be null — the order is created at prepare-check (payment time).
    // KDS tickets are created regardless; orderId is backfilled when the check is prepared.

    const rawLocationId = data.locationId || tab.locationId;

    if (!rawLocationId) {
      logger.error('[kds] handleCourseSent: no locationId on tab or event — cannot create tickets', {
        domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
        eventLocationId: data.locationId, tabLocationId: tab.locationId,
      });
      return;
    }

    // Each location owns its own KDS stations — use the location directly, no venue→site promotion
    const locationId = rawLocationId;

    if (!items.length) {
      logger.warn('[kds] handleCourseSent: no items found for course', {
        domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber, locationId,
      });
      return;
    }

    logger.info('[kds] handleCourseSent: processing course', {
      domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
      locationId, itemCount: items.length, courseName,
    });

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
      logger.warn('[kds] handleCourseSent: unroutable items', {
        domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
        locationId, unroutedCount: unrouted.length, totalItems: items.length,
      });
    }

    // 7. Group routed items by station
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const stationGroups = new Map<string, Array<{
      orderLineId: string;
      catalogItemId: string;
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
        catalogItemId: item.catalogItemId,
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
      logger.warn('[kds] handleCourseSent: no stations resolved — no tickets will be created', {
        domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
        locationId, itemCount: items.length,
      });
      return;
    }

    logger.info('[kds] handleCourseSent: creating tickets', {
      domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
      locationId, stationCount: stationGroups.size,
      routedItemCount: routingResults.filter((r) => r.stationId).length,
    });

    // 7b. Pre-fetch station names for send tracking (non-critical, batch query)
    const stationNameMap = new Map<string, string>();
    try {
      const stationIds = Array.from(stationGroups.keys());
      const stationNameRows = await withTenant(tenantId, (tx) =>
        tx.execute(sql`
          SELECT id, display_name FROM fnb_kitchen_stations
          WHERE tenant_id = ${tenantId} AND id IN (${sql.join(stationIds.map((id) => sql`${id}`), sql`, `)})
        `),
      );
      for (const row of Array.from(stationNameRows as Iterable<Record<string, unknown>>)) {
        stationNameMap.set(row.id as string, (row.display_name as string) ?? 'Unknown');
      }
    } catch (err) {
      logger.warn('[kds] handleCourseSent: station name prefetch failed — using IDs as fallback', {
        domain: 'kds', tenantId, tabId: data.tabId,
        stationIds: Array.from(stationGroups.keys()),
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }

    // 8. Create one kitchen ticket per station (serial to avoid pool exhaustion — gotcha #466).
    // Each ticket has a deterministic idempotency key (tab+course+station),
    // so replays won't create duplicates.
    const syntheticCtx = {
      tenantId,
      locationId,
      user: { id: 'system', email: 'system@oppsera.com', role: 'system' },
      requestId: `kds-consumer-${data.tabId}-${data.courseNumber}`,
      isPlatformAdmin: false,
    } as unknown as RequestContext;

    for (const [stationId, ticketItems] of stationGroups) {
      try {
        const clientRequestId = `kds-course-${data.tabId}-${data.courseNumber}-${stationId}`;
        const ticket = await createKitchenTicket(syntheticCtx, {
          clientRequestId,
          tabId: data.tabId,
          orderId: tab.primaryOrderId ?? undefined,
          courseNumber: data.courseNumber,
          orderType: tab.tabType ?? undefined,
          channel: 'pos',
          items: ticketItems,
        });

        // Record send tracking so orders appear in KDS Order Status
        try {
          // Deterministic token — replays won't create duplicate tracking rows
          const sendToken = `kds-send-${ticket.id}-${stationId}-initial`;
          const tracked = await recordKdsSend({
            tenantId,
            locationId,
            orderId: tab.primaryOrderId ?? undefined,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            courseId: undefined,
            courseNumber: data.courseNumber,
            stationId,
            stationName: stationNameMap.get(stationId) ?? stationId,
            employeeId: 'system',
            employeeName: 'System',
            sendToken,
            sendType: 'initial',
            routingReason: 'routing_rule',
            itemCount: ticketItems.length,
            orderType: tab.tabType ?? undefined,
            tableName: undefined,
            guestName: undefined,
            businessDate: tab.businessDate,
          });
          await markKdsSendSent(tenantId, tracked.sendToken);
        } catch (trackErr) {
          logger.warn('[kds] handleCourseSent: send tracking failed (non-critical)', {
            domain: 'kds', tenantId, ticketId: ticket.id, stationId,
            error: { message: trackErr instanceof Error ? trackErr.message : String(trackErr) },
          });
        }
      } catch (err) {
        // Log but don't throw — idempotency duplicate is expected on replay
        logger.warn('[kds] handleCourseSent: failed to create ticket for station', {
          domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
          stationId, locationId,
          error: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  } catch (err) {
    // Consumer must never throw
    logger.error('[kds] handleCourseSent: unhandled error', {
      domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
      locationId: data.locationId,
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
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
