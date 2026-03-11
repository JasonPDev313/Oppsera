import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbTabCourses, fnbTabs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { FireCourseFromKdsInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, CourseNotFoundError, CourseStatusConflictError, CourseLockedError } from '../errors';
import { resolveCourseRule } from '../helpers/resolve-course-rule';

const FIREABLE_STATUSES = ['unsent', 'sent'] as const;

/**
 * Fire a course from the KDS display by ticket ID.
 *
 * Looks up the tab + course from a kitchen ticket, then fires the course.
 * This enables KDS operators to pace courses without switching to the POS.
 */
export async function fireCourseFromKds(
  ctx: RequestContext,
  input: FireCourseFromKdsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'fireCourseFromKds',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };
    }

    // Resolve tab + course from the ticket
    const ticketRows = await tx.execute(
      sql`SELECT tab_id, course_number FROM fnb_kitchen_tickets
          WHERE id = ${input.ticketId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const ticket = Array.from(ticketRows as Iterable<Record<string, unknown>>)[0];
    if (!ticket || !ticket.tab_id) throw new TabNotFoundError(input.ticketId);

    const tabId = ticket.tab_id as string;
    const courseNumber = input.courseNumber ?? (ticket.course_number as number | null);
    if (!courseNumber) throw new CourseNotFoundError(tabId, 0);

    // Load the tab for location scoping
    const [tab] = await tx
      .select()
      .from(fnbTabs)
      .where(and(
        eq(fnbTabs.id, tabId),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!tab) throw new TabNotFoundError(tabId);

    if (ctx.locationId && tab.locationId !== ctx.locationId) {
      throw new TabNotFoundError(tabId);
    }

    // Load the course
    const [course] = await tx
      .select()
      .from(fnbTabCourses)
      .where(and(
        eq(fnbTabCourses.tabId, tabId),
        eq(fnbTabCourses.courseNumber, courseNumber),
        eq(fnbTabCourses.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!course) throw new CourseNotFoundError(tabId, courseNumber);

    if (!FIREABLE_STATUSES.includes(course.courseStatus as typeof FIREABLE_STATUSES[number])) {
      throw new CourseStatusConflictError(courseNumber, course.courseStatus, 'fire from KDS');
    }

    // Check if any items in this course are locked — warn but allow fire
    // (lockCourse prevents course assignment changes, not firing)
    try {
      const ticketItemRows = await tx.execute(
        sql`SELECT DISTINCT kti.catalog_item_id
            FROM fnb_kitchen_ticket_items kti
            INNER JOIN fnb_kitchen_tickets kt ON kt.id = kti.ticket_id AND kt.tenant_id = kti.tenant_id
            WHERE kt.tab_id = ${tabId} AND kt.course_number = ${courseNumber}
              AND kti.tenant_id = ${ctx.tenantId}
              AND kti.item_status NOT IN ('voided')
            LIMIT 50`,
      );
      const itemIds = Array.from(ticketItemRows as Iterable<Record<string, unknown>>)
        .map((r) => r.catalog_item_id as string)
        .filter(Boolean);

      if (itemIds.length > 0 && tab.locationId) {
        for (const catalogItemId of itemIds) {
          const resolved = await resolveCourseRule(ctx.tenantId, tab.locationId, catalogItemId);
          if (resolved.effectiveRule.lockCourse && resolved.effectiveRule.defaultCourseNumber != null
              && resolved.effectiveRule.defaultCourseNumber !== courseNumber) {
            logger.warn('[kds] fire-course: item locked to different course', {
              domain: 'kds', tenantId: ctx.tenantId, tabId, courseNumber,
              catalogItemId, lockedCourse: resolved.effectiveRule.defaultCourseNumber,
            });
          }
        }
      }
    } catch (err) {
      // Non-critical — lock check is informational
      logger.warn('[kds] fire-course: lock check failed', {
        domain: 'kds', tenantId: ctx.tenantId, tabId, courseNumber,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }

    const now = new Date();
    const events: ReturnType<typeof buildEventFromContext>[] = [];

    // If course was unsent, mark it as sent first (with optimistic lock)
    let currentStatus = course.courseStatus;
    if (currentStatus === 'unsent') {
      const [sent] = await tx
        .update(fnbTabCourses)
        .set({ courseStatus: 'sent', sentAt: now, updatedAt: now })
        .where(and(
          eq(fnbTabCourses.id, course.id),
          eq(fnbTabCourses.tenantId, ctx.tenantId),
          eq(fnbTabCourses.courseStatus, 'unsent'), // optimistic lock
        ))
        .returning();
      if (!sent) throw new CourseStatusConflictError(courseNumber, 'unsent', 'fire from KDS (concurrent)');
      currentStatus = 'sent';

      events.push(buildEventFromContext(ctx, FNB_EVENTS.COURSE_SENT, {
        tabId,
        locationId: tab.locationId,
        courseNumber,
      }));
    }

    // Fire the course (with optimistic lock)
    const [fired] = await tx
      .update(fnbTabCourses)
      .set({
        courseStatus: 'fired',
        firedAt: now,
        firedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(and(
        eq(fnbTabCourses.id, course.id),
        eq(fnbTabCourses.tenantId, ctx.tenantId),
        eq(fnbTabCourses.courseStatus, currentStatus), // optimistic lock
      ))
      .returning();
    if (!fired) throw new CourseStatusConflictError(courseNumber, currentStatus, 'fire from KDS (concurrent)');

    events.push(buildEventFromContext(ctx, FNB_EVENTS.COURSE_FIRED, {
      tabId,
      locationId: tab.locationId,
      courseNumber,
    }));

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'fireCourseFromKds', fired);

    return { result: fired!, events };
  });

  logger.info('[kds] course fired from KDS', {
    domain: 'kds', tenantId: ctx.tenantId, locationId: ctx.locationId,
    ticketId: input.ticketId, courseNumber: input.courseNumber, userId: ctx.user.id,
  });

  auditLogDeferred(ctx, 'fnb.kds.course_fired', 'fnb_tab_courses', result.id as string);
  return result;
}
