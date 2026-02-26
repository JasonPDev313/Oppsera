import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbTabs, fnbTabItems, fnbTabCourses, fnbKitchenStations } from '@oppsera/db';
import { resolveStation } from '../helpers/resolve-station';
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
 * 1. Fetches the tab + items for that course
 * 2. Resolves the target KDS station per item via routing rules
 * 3. Groups items by station
 * 4. Creates one kitchen ticket per station
 *
 * Idempotent via deterministic clientRequestId per tab+course+station.
 * Never throws — logs errors and continues (fire-and-forget consumer pattern).
 */
export async function handleCourseSent(
  tenantId: string,
  data: CourseSentConsumerData,
): Promise<void> {
  try {
    await withTenant(tenantId, async (tx) => {
      // 1. Fetch the tab (need orderId + locationId)
      const [tab] = await (tx as any)
        .select({
          id: fnbTabs.id,
          locationId: fnbTabs.locationId,
          primaryOrderId: fnbTabs.primaryOrderId,
          businessDate: fnbTabs.businessDate,
          tableId: fnbTabs.tableId,
        })
        .from(fnbTabs)
        .where(
          and(
            eq(fnbTabs.id, data.tabId),
            eq(fnbTabs.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!tab) {
        console.warn(`[handleCourseSent] Tab not found: ${data.tabId}`);
        return;
      }

      if (!tab.primaryOrderId) {
        console.warn(`[handleCourseSent] Tab ${data.tabId} has no primaryOrderId — skipping ticket creation`);
        return;
      }

      const locationId = data.locationId || tab.locationId;

      // 2. Fetch the course record (for courseName)
      const [course] = await (tx as any)
        .select({
          courseName: fnbTabCourses.courseName,
        })
        .from(fnbTabCourses)
        .where(
          and(
            eq(fnbTabCourses.tabId, data.tabId),
            eq(fnbTabCourses.courseNumber, data.courseNumber),
          ),
        )
        .limit(1);

      const courseName = course?.courseName ?? `Course ${data.courseNumber}`;

      // 3. Fetch items for this course (only non-voided items)
      const items = await (tx as any)
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
            // Only include items that haven't been voided
            inArray(fnbTabItems.status, ['draft', 'sent', 'fired']),
          ),
        );

      if (!items.length) {
        console.warn(`[handleCourseSent] No items for tab ${data.tabId} course ${data.courseNumber}`);
        return;
      }

      // 4. Check if any stations exist at this location
      const stationCheck = await (tx as any)
        .select({ id: fnbKitchenStations.id })
        .from(fnbKitchenStations)
        .where(
          and(
            eq(fnbKitchenStations.tenantId, tenantId),
            eq(fnbKitchenStations.locationId, locationId),
            eq(fnbKitchenStations.isActive, true),
          ),
        )
        .limit(1);

      if (!stationCheck.length) {
        console.warn(`[handleCourseSent] No active KDS stations at location ${locationId} — skipping ticket creation`);
        return;
      }

      // 5. Resolve station for each item and group by station
      const stationGroups = new Map<string, Array<{
        orderLineId: string;
        itemName: string;
        modifierSummary?: string;
        specialInstructions?: string;
        seatNumber?: number;
        courseName: string;
        quantity: number;
      }>>();

      for (const item of items) {
        const stationId = await resolveStation(tx, tenantId, locationId, {
          catalogItemId: item.catalogItemId,
          subDepartmentId: item.subDepartmentId,
        });

        if (!stationId) continue; // shouldn't happen since we checked above

        const modSummary = formatModifierSummary(item.modifiers);
        const group = stationGroups.get(stationId) ?? [];
        group.push({
          orderLineId: item.id, // use tab item ID as the order line reference
          itemName: item.catalogItemName,
          modifierSummary: modSummary ?? undefined,
          specialInstructions: item.specialInstructions ?? undefined,
          seatNumber: item.seatNumber ?? undefined,
          courseName,
          quantity: Number(item.qty) || 1,
        });
        stationGroups.set(stationId, group);
      }

      // 6. Create one kitchen ticket per station
      const syntheticCtx = {
        tenantId,
        locationId,
        user: { id: 'system', email: 'system@oppsera.com', role: 'system' },
        requestId: `kds-consumer-${data.tabId}-${data.courseNumber}`,
        isPlatformAdmin: false,
      } as unknown as RequestContext;

      for (const [stationId, ticketItems] of stationGroups) {
        const clientRequestId = `kds-course-${data.tabId}-${data.courseNumber}-${stationId}`;

        try {
          await createKitchenTicket(syntheticCtx, {
            clientRequestId,
            tabId: data.tabId,
            orderId: tab.primaryOrderId,
            courseNumber: data.courseNumber,
            items: ticketItems.map((ti) => ({
              ...ti,
              stationId,
            })),
          });
        } catch (err) {
          // Log but don't throw — idempotency duplicate is expected on replay
          console.warn(
            `[handleCourseSent] Failed to create ticket for station ${stationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  } catch (err) {
    // Consumer must never throw
    console.error(
      `[handleCourseSent] Unhandled error for tab ${data.tabId} course ${data.courseNumber}: ${err instanceof Error ? err.message : String(err)}`,
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
