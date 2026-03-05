import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
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
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Validate tab exists
    const [tab] = await tx
      .select()
      .from(fnbTabs)
      .where(and(
        eq(fnbTabs.id, input.tabId),
        eq(fnbTabs.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!tab) throw new TabNotFoundError(input.tabId);

    // Find the course
    const [course] = await tx
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

    const wasPreviouslyUnsent = course.courseStatus === 'unsent';

    const [updated] = await tx
      .update(fnbTabCourses)
      .set({
        courseStatus: 'fired',
        // Backfill sentAt when firing an unsent course directly
        sentAt: wasPreviouslyUnsent ? new Date() : undefined,
        firedAt: new Date(),
        firedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(fnbTabCourses.id, course.id))
      .returning();

    // Update tab status when firing from unsent (same as sendCourse)
    if (wasPreviouslyUnsent && ['open', 'ordering'].includes(tab.status)) {
      await tx
        .update(fnbTabs)
        .set({
          status: 'sent_to_kitchen',
          version: tab.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(fnbTabs.id, input.tabId));
    }

    // When firing an unsent course, also emit course.sent so the KDS
    // consumer creates kitchen tickets. Without this, the course skips
    // the send step entirely and no KDS tickets are generated.
    const events = [];
    if (wasPreviouslyUnsent) {
      events.push(buildEventFromContext(ctx, FNB_EVENTS.COURSE_SENT, {
        tabId: input.tabId,
        locationId: tab.locationId,
        courseNumber: input.courseNumber,
      }));
    }
    events.push(buildEventFromContext(ctx, FNB_EVENTS.COURSE_FIRED, {
      tabId: input.tabId,
      locationId: tab.locationId,
      courseNumber: input.courseNumber,
    }));

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'fireCourse', updated);

    return { result: updated!, events };
  });

  auditLogDeferred(ctx, 'fnb.course.fired', 'fnb_tab_courses', result.id, undefined, {
    tabId: input.tabId,
    courseNumber: input.courseNumber,
  });

  return result;
}
