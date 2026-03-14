import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import { logger } from '@oppsera/core/observability';
import { fnbTabItems, fnbTabCourses } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { AddTabItemsInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { batchResolveCourseRules } from '../helpers/resolve-course-rule';
import type { ResolvedCourseRule } from '../helpers/resolve-course-rule';

export async function addTabItems(
  ctx: RequestContext,
  input: AddTabItemsInput,
) {
  // ── Resolve authoritative location from the tab itself ──────────
  // The tab's location_id (NOT NULL, set at creation) is the single source of truth.
  // ctx.locationId from the client header may be wrong for multi-location tenants.
  let tabLocationId: string | undefined;
  try {
    const tabLocRows = await withTenant(ctx.tenantId, async (tx) => {
      return tx.execute(
        sql`SELECT location_id FROM fnb_tabs
            WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            LIMIT 1`,
      );
    });
    const tabLocArr = Array.from(tabLocRows as Iterable<Record<string, unknown>>);
    tabLocationId = tabLocArr[0]?.location_id as string | undefined;
  } catch (err) {
    logger.error('[add-tab-items] Failed to read tab location', {
      domain: 'fnb', tenantId: ctx.tenantId, tabId: input.tabId,
      error: { message: err instanceof Error ? err.message : String(err) },
    });
  }
  const effectiveLocationId = tabLocationId ?? ctx.locationId ?? '';
  if (ctx.locationId && tabLocationId && ctx.locationId !== tabLocationId) {
    logger.warn('[add-tab-items] LOCATION MISMATCH: client sent different location than tab', {
      domain: 'fnb', tenantId: ctx.tenantId, tabId: input.tabId,
      clientLocationId: ctx.locationId, tabLocationId,
    });
  }

  // Resolve sub-department IDs from catalog BEFORE the transaction (gotcha #123)
  const subDeptMap = new Map<string, string | null>();
  try {
    const catalogApi = getCatalogReadApi();
    const uniqueItemIds = [...new Set(input.items.map((i) => i.catalogItemId))];
    const results = await Promise.all(
      uniqueItemIds.map((id) =>
        catalogApi.getItemForPOS(ctx.tenantId, effectiveLocationId, id).catch(() => null),
      ),
    );
    for (let i = 0; i < uniqueItemIds.length; i++) {
      subDeptMap.set(uniqueItemIds[i]!, results[i]?.subDepartmentId ?? null);
    }
  } catch (err) {
    // CatalogReadApi may not be initialized — proceed without sub-department IDs
    logger.error('[add-tab-items] CatalogReadApi error', {
      domain: 'fnb', tenantId: ctx.tenantId, error: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  // Resolve course rules per item (soft enforcement — auto-default, warn on violations)
  // Uses batch resolver (2 DB queries total) instead of N individual queries
  let courseRuleMap: Record<string, ResolvedCourseRule> = {};
  const courseDefNames = new Map<number, string>();
  if (effectiveLocationId) {
    try {
      courseRuleMap = await batchResolveCourseRules(ctx.tenantId, effectiveLocationId);

      // Fetch course definition names for this location
      const defRows = await withTenant(ctx.tenantId, async (tx) => {
        return tx.execute(
          sql`SELECT course_number, course_name FROM fnb_course_definitions
              WHERE tenant_id = ${ctx.tenantId} AND location_id = ${effectiveLocationId}
                AND is_active = true
              ORDER BY course_number`,
        );
      });
      for (const row of Array.from(defRows as Iterable<Record<string, unknown>>)) {
        courseDefNames.set(Number(row.course_number), String(row.course_name));
      }
    } catch (err) {
      logger.error('[add-tab-items] Course rule resolution error', {
        domain: 'fnb', tenantId: ctx.tenantId, error: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  } else {
    logger.warn('[add-tab-items] No locationId from tab or context — course rule enforcement skipped', {
      domain: 'fnb', tenantId: ctx.tenantId, tabId: input.tabId,
    });
  }

  // Apply course rules to items (mutate courseNumber in-place for soft enforcement)
  const effectiveItems = input.items.map((item) => {
    const rule = courseRuleMap[item.catalogItemId];
    if (!rule || rule.source === 'none') return { ...item };

    const { effectiveRule } = rule;
    let courseNumber = item.courseNumber;

    // Lock enforcement: force defaultCourseNumber regardless of client value
    if (effectiveRule.lockCourse && effectiveRule.defaultCourseNumber != null) {
      if (courseNumber !== effectiveRule.defaultCourseNumber) {
        logger.warn('[add-tab-items] Course locked — forcing default', {
          domain: 'fnb', tenantId: ctx.tenantId, catalogItemId: item.catalogItemId,
          requestedCourse: courseNumber, forcedCourse: effectiveRule.defaultCourseNumber,
        });
      }
      courseNumber = effectiveRule.defaultCourseNumber;
    }
    // Allowed course validation (soft: auto-correct + warn)
    else if (effectiveRule.allowedCourseNumbers && effectiveRule.allowedCourseNumbers.length > 0) {
      if (!effectiveRule.allowedCourseNumbers.includes(courseNumber)) {
        const fallback = effectiveRule.defaultCourseNumber ?? effectiveRule.allowedCourseNumbers[0]!;
        logger.warn('[add-tab-items] Course not allowed — falling back', {
          domain: 'fnb', tenantId: ctx.tenantId, catalogItemId: item.catalogItemId,
          requestedCourse: courseNumber, allowedCourses: effectiveRule.allowedCourseNumbers, fallbackCourse: fallback,
        });
        courseNumber = fallback;
      }
    }
    // Auto-default: only apply when client sent no explicit course (courseNumber would be
    // the POS activeCourseNumber which may not match the item's default — don't silently
    // override the server's active course selection without a lock)

    return { ...item, courseNumber };
  });

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'addTabItems',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Validate tab exists and is in a writable state
    const tabRows = await tx.execute(
      sql`SELECT id, status FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const tabArr = Array.from(tabRows as Iterable<Record<string, unknown>>);
    if (tabArr.length === 0) {
      throw new AppError('TAB_NOT_FOUND', `Tab ${input.tabId} not found`, 404);
    }
    const tab = tabArr[0]!;
    if (!['open', 'ordering', 'sent_to_kitchen'].includes(tab.status as string)) {
      throw new AppError(
        'TAB_NOT_WRITABLE',
        `Tab is ${tab.status as string}, cannot add items`,
        409,
      );
    }

    // Get existing course numbers for this tab
    const courseRows = await tx.execute(
      sql`SELECT course_number FROM fnb_tab_courses
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const existingCourses = new Set(
      Array.from(courseRows as Iterable<Record<string, unknown>>)
        .map((c) => Number(c.course_number ?? 0)),
    );

    // Auto-create any courses that don't exist yet
    const neededCourses = new Set(effectiveItems.map((item) => item.courseNumber));
    for (const courseNumber of neededCourses) {
      if (!existingCourses.has(courseNumber)) {
        const courseName = courseDefNames.get(courseNumber) ?? `Course ${courseNumber}`;
        await tx.insert(fnbTabCourses).values({
          tenantId: ctx.tenantId,
          tabId: input.tabId,
          courseNumber,
          courseName,
          courseStatus: 'unsent',
        });
        existingCourses.add(courseNumber);
      }
    }

    // Build all rows and batch-insert in one statement
    const rowsToInsert = effectiveItems.map((item, i) => {
      const extendedPriceCents = Math.round(item.qty * item.unitPriceCents);
      const id = generateUlid();
      const subDepartmentId = subDeptMap.get(item.catalogItemId) ?? null;
      return {
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
        status: 'draft' as const,
        sortOrder: i,
        createdBy: ctx.user.id,
      };
    });

    if (rowsToInsert.length > 0) {
      await tx.insert(fnbTabItems).values(rowsToInsert);
    }

    const insertedItems = rowsToInsert.map((row) => ({
      id: row.id,
      catalogItemId: row.catalogItemId,
      catalogItemName: row.catalogItemName,
      seatNumber: row.seatNumber,
      courseNumber: row.courseNumber,
      qty: Number(row.qty),
      unitPriceCents: row.unitPriceCents,
      extendedPriceCents: row.extendedPriceCents,
      subDepartmentId: row.subDepartmentId,
      modifiers: row.modifiers,
      specialInstructions: row.specialInstructions,
      status: 'draft' as const,
    }));

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEMS_ADDED, {
      tabId: input.tabId,
      locationId: effectiveLocationId || ctx.locationId,
      itemCount: insertedItems.length,
      courseNumbers: [...neededCourses],
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'addTabItems', insertedItems);

    return { result: insertedItems, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tab.items_added', 'fnb_tabs', input.tabId, undefined, {
    itemCount: result.length,
  });

  return result;
}
