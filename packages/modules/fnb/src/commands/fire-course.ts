import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbTabs, fnbTabCourses } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { FireCourseInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, CourseNotFoundError, CourseStatusConflictError } from '../errors';

const FIREABLE_STATUSES = ['unsent', 'sent'];

export async function fireCourse(
  ctx: RequestContext,
  input: FireCourseInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'fireCourse',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate tab exists
    const [tab] = await (tx as any)
      .select()
      .from(fnbTabs)
      .where(and(
        eq(fnbTabs.id, input.tabId),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!tab) throw new TabNotFoundError(input.tabId);

    // Find the course
    const [course] = await (tx as any)
      .select()
      .from(fnbTabCourses)
      .where(and(
        eq(fnbTabCourses.tabId, input.tabId),
        eq(fnbTabCourses.courseNumber, input.courseNumber),
      ))
      .limit(1);
    if (!course) throw new CourseNotFoundError(input.tabId, input.courseNumber);

    if (!FIREABLE_STATUSES.includes(course.courseStatus)) {
      throw new CourseStatusConflictError(input.courseNumber, course.courseStatus, 'fire');
    }

    const [updated] = await (tx as any)
      .update(fnbTabCourses)
      .set({
        courseStatus: 'fired',
        firedAt: new Date(),
        firedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(fnbTabCourses.id, course.id))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.COURSE_FIRED, {
      tabId: input.tabId,
      locationId: tab.locationId,
      courseNumber: input.courseNumber,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'fireCourse', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.course.fired', 'fnb_tab_courses', result.id, undefined, {
    tabId: input.tabId,
    courseNumber: input.courseNumber,
  });

  return result;
}
