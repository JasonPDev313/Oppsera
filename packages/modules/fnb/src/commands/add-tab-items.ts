import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import { fnbTabItems, fnbTabCourses } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { AddTabItemsInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function addTabItems(
  ctx: RequestContext,
  input: AddTabItemsInput,
) {
  // Resolve sub-department IDs from catalog BEFORE the transaction (gotcha #123)
  const subDeptMap = new Map<string, string | null>();
  try {
    const catalogApi = getCatalogReadApi();
    const uniqueItemIds = [...new Set(input.items.map((i) => i.catalogItemId))];
    const results = await Promise.all(
      uniqueItemIds.map((id) =>
        catalogApi.getItemForPOS(ctx.tenantId, id, ctx.locationId ?? '').catch(() => null),
      ),
    );
    for (let i = 0; i < uniqueItemIds.length; i++) {
      subDeptMap.set(uniqueItemIds[i]!, results[i]?.subDepartmentId ?? null);
    }
  } catch {
    // CatalogReadApi may not be initialized — proceed without sub-department IDs
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'addTabItems',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate tab exists and is in a writable state
    const tabRows = await (tx as any).execute(
      sql`SELECT id, status FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const tabArr = Array.from(tabRows as Iterable<Record<string, unknown>>);
    if (tabArr.length === 0) {
      throw new AppError('TAB_NOT_FOUND', `Tab ${input.tabId} not found`, 404);
    }
    const tab = tabArr[0]!;
    if (!['open', 'sent_to_kitchen'].includes(tab.status as string)) {
      throw new AppError(
        'TAB_NOT_WRITABLE',
        `Tab is ${tab.status as string}, cannot add items`,
        409,
      );
    }

    // Get existing course numbers for this tab
    const courseRows = await (tx as any).execute(
      sql`SELECT course_number FROM fnb_tab_courses
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const existingCourses = new Set(
      Array.from(courseRows as Iterable<Record<string, unknown>>)
        .map((c) => Number(c.course_number)),
    );

    // Auto-create any courses that don't exist yet
    const neededCourses = new Set(input.items.map((item) => item.courseNumber));
    for (const courseNumber of neededCourses) {
      if (!existingCourses.has(courseNumber)) {
        await (tx as any).insert(fnbTabCourses).values({
          tenantId: ctx.tenantId,
          tabId: input.tabId,
          courseNumber,
          courseName: `Course ${courseNumber}`,
          courseStatus: 'unsent',
        });
        existingCourses.add(courseNumber);
      }
    }

    // Insert all items
    const insertedItems = [];
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!;
      const extendedPriceCents = Math.round(item.qty * item.unitPriceCents);
      const id = generateUlid();

      const subDepartmentId = subDeptMap.get(item.catalogItemId) ?? null;

      await (tx as any).insert(fnbTabItems).values({
        id,
        tenantId: ctx.tenantId,
        tabId: input.tabId,
        catalogItemId: item.catalogItemId,
        catalogItemName: item.catalogItemName,
        seatNumber: item.seatNumber,
        courseNumber: item.courseNumber,
        qty: String(item.qty),
        unitPriceCents: item.unitPriceCents,
        extendedPriceCents,
        subDepartmentId,
        modifiers: item.modifiers,
        specialInstructions: item.specialInstructions ?? null,
        status: 'draft',
        sortOrder: i,
        createdBy: ctx.user.id,
      });

      insertedItems.push({
        id,
        catalogItemId: item.catalogItemId,
        catalogItemName: item.catalogItemName,
        seatNumber: item.seatNumber,
        courseNumber: item.courseNumber,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        extendedPriceCents,
        subDepartmentId,
        modifiers: item.modifiers,
        specialInstructions: item.specialInstructions ?? null,
        status: 'draft',
      });
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEMS_ADDED, {
      tabId: input.tabId,
      locationId: ctx.locationId,
      itemCount: insertedItems.length,
      courseNumbers: [...neededCourses],
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'addTabItems', insertedItems);

    return { result: insertedItems, events: [event] };
  });

  await auditLog(ctx, 'fnb.tab.items_added', 'fnb_tabs', input.tabId, undefined, {
    itemCount: result.length,
  });

  return result;
}
