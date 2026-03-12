/**
 * Resend Course to KDS — synchronous, direct ticket creation.
 *
 * This bypasses the event consumer (handleCourseSent) and creates kitchen
 * tickets directly. Use when the consumer silently failed and tickets were
 * not created despite the course being marked as "sent".
 *
 * Idempotent: uses the same deterministic clientRequestId scheme as the
 * event consumer, so duplicate tickets cannot be created.
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbTabs, fnbTabItems, fnbTabCourses } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems, resolveKdsLocationId } from '../services/kds-routing-engine';
import type { RoutableItem } from '../services/kds-routing-engine';
import { createKitchenTicket } from './create-kitchen-ticket';
import type { RequestContext } from '@oppsera/core/auth/context';
import { normalizeBusinessDate } from '../helpers/normalize-business-date';

export interface ResendCourseInput {
  tabId: string;
  courseNumber: number;
}

export interface ResendCourseResult {
  ticketsCreated: number;
  ticketsFailed: number;
  itemsRouted: number;
  itemsUnrouted: number;
  errors: string[];
  diagnosis: string[];
}

export async function resendCourseToKds(
  ctx: RequestContext,
  input: ResendCourseInput,
): Promise<ResendCourseResult> {
  const result: ResendCourseResult = {
    ticketsCreated: 0,
    ticketsFailed: 0,
    itemsRouted: 0,
    itemsUnrouted: 0,
    errors: [],
    diagnosis: [],
  };

  try {
    // 1. Fetch tab, course, and items
    const [tabResult, courseResult, items] = await Promise.all([
      withTenant(ctx.tenantId, (tx) =>
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
              eq(fnbTabs.id, input.tabId),
              eq(fnbTabs.tenantId, ctx.tenantId),
            ),
          )
          .limit(1),
      ),
      withTenant(ctx.tenantId, (tx) =>
        tx
          .select({ courseName: fnbTabCourses.courseName })
          .from(fnbTabCourses)
          .where(
            and(
              eq(fnbTabCourses.tenantId, ctx.tenantId),
              eq(fnbTabCourses.tabId, input.tabId),
              eq(fnbTabCourses.courseNumber, input.courseNumber),
            ),
          )
          .limit(1),
      ),
      withTenant(ctx.tenantId, (tx) =>
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
              eq(fnbTabItems.tenantId, ctx.tenantId),
              eq(fnbTabItems.tabId, input.tabId),
              eq(fnbTabItems.courseNumber, input.courseNumber),
              inArray(fnbTabItems.status, ['draft', 'sent', 'fired']),
            ),
          ),
      ),
    ]);

    const tabRaw = tabResult[0];
    const courseName = courseResult[0]?.courseName ?? `Course ${input.courseNumber}`;

    if (!tabRaw) {
      result.errors.push(`Tab ${input.tabId} not found`);
      return result;
    }

    // Normalize businessDate: Drizzle date() without mode:'string' returns JS Date at runtime
    const tab = {
      ...tabRaw,
      businessDate: normalizeBusinessDate(tabRaw.businessDate),
    };

    const rawLocationId = ctx.locationId || tab.locationId;
    if (!rawLocationId) {
      result.errors.push('No locationId on context or tab');
      return result;
    }

    // Resolve effective KDS location (site↔venue hierarchy fallback)
    const locationId = await resolveKdsLocationId(ctx.tenantId, rawLocationId);

    // Override ctx.locationId so createKitchenTicket (which reads ctx.locationId directly) works
    // at the resolved location where routing rules and stations exist.
    const effectiveCtx = locationId !== ctx.locationId
      ? { ...ctx, locationId } as RequestContext
      : ctx;

    result.diagnosis.push(`Tab found: rawLocationId=${rawLocationId}, resolvedLocationId=${locationId}, tabType=${tab.tabType ?? 'null'}`);

    if (items.length === 0) {
      result.errors.push(`No items found for Course ${input.courseNumber} (status: draft/sent/fired)`);
      return result;
    }
    result.diagnosis.push(`Found ${items.length} item(s) in Course ${input.courseNumber}`);

    // 2. Check for existing tickets (idempotency)
    const existingTickets = await withTenant(ctx.tenantId, (tx) =>
      tx.execute(sql`
        SELECT id, ticket_number, status
        FROM fnb_kitchen_tickets
        WHERE tenant_id = ${ctx.tenantId}
          AND tab_id = ${input.tabId}
          AND course_number = ${input.courseNumber}
      `),
    );
    const existingCount = Array.from(existingTickets as Iterable<Record<string, unknown>>).length;
    if (existingCount > 0) {
      result.diagnosis.push(`${existingCount} ticket(s) already exist for this course — idempotency will prevent duplicates`);
    }

    // 3. Build routable items
    let routableItems: RoutableItem[] = items.map((item) => ({
      orderLineId: item.id,
      catalogItemId: item.catalogItemId,
      subDepartmentId: item.subDepartmentId ?? null,
      modifierIds: extractModifierIds(item.modifiers),
    }));

    // 4. Enrich with catalog hierarchy
    routableItems = await enrichRoutableItems(ctx.tenantId, routableItems);

    for (const ri of routableItems) {
      result.diagnosis.push(
        `Enriched: ${items.find((i) => i.id === ri.orderLineId)?.catalogItemName} → ` +
        `dept=${ri.departmentId ?? 'null'}, subDept=${ri.subDepartmentId ?? 'null'}, cat=${ri.categoryId ?? 'null'}`,
      );
    }

    // 5. Resolve routing
    const routingResults = await resolveStationRouting(
      {
        tenantId: ctx.tenantId,
        locationId,
        orderType: tab.tabType ?? undefined,
        channel: 'pos',
      },
      routableItems,
    );

    for (const rr of routingResults) {
      const itemName = items.find((i) => i.id === rr.orderLineId)?.catalogItemName ?? rr.orderLineId;
      if (rr.stationId) {
        result.itemsRouted++;
        result.diagnosis.push(`Routed: "${itemName}" → station=${rr.stationId} (match=${rr.matchType}, rule=${rr.routingRuleId ?? 'fallback'})`);
      } else {
        result.itemsUnrouted++;
        result.diagnosis.push(`UNROUTED: "${itemName}" — no station matched and no fallback available`);
      }
    }

    // 6. Group by station
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
      result.errors.push('No stations resolved — no tickets will be created');
      return result;
    }

    result.diagnosis.push(`Grouped into ${stationGroups.size} station(s)`);

    // 7. Create tickets (serial to avoid pool exhaustion)
    for (const [stationId, ticketItems] of stationGroups) {
      try {
        const clientRequestId = `kds-course-${input.tabId}-${input.courseNumber}-${stationId}`;
        await createKitchenTicket(effectiveCtx, {
          clientRequestId,
          tabId: input.tabId,
          orderId: tab.primaryOrderId ?? undefined,
          courseNumber: input.courseNumber,
          orderType: tab.tabType ?? undefined,
          channel: 'pos',
          items: ticketItems,
        });
        result.ticketsCreated++;
        result.diagnosis.push(`Ticket created for station ${stationId} (${ticketItems.length} items)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Idempotency duplicate is expected — count as success
        if (msg.includes('idempotency') || msg.includes('duplicate')) {
          result.diagnosis.push(`Ticket for station ${stationId}: already exists (idempotency)`);
          result.ticketsCreated++;
        } else {
          result.ticketsFailed++;
          result.errors.push(`Station ${stationId}: ${msg}`);
          result.diagnosis.push(`FAIL: Ticket creation for station ${stationId}: ${msg}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Unexpected error: ${msg}`);
    logger.error('[kds] resendCourseToKds: unexpected error', {
      domain: 'kds',
      tenantId: ctx.tenantId,
      tabId: input.tabId,
      courseNumber: input.courseNumber,
      error: { message: msg, stack: err instanceof Error ? err.stack : undefined },
    });
  }

  return result;
}

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
