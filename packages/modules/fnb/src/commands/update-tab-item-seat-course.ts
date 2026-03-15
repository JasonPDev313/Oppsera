import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { ValidationError } from '@oppsera/shared';
import { FNB_EVENTS } from '../events/types';
import { TabItemNotFoundError, TabItemStatusConflictError } from '../errors';
import type { UpdateTabItemSeatCourseInput } from '../validation';

// draft/unsent = free move; sent = allowed (manager override enforced client-side)
const MOVABLE_STATUSES = ['draft', 'unsent', 'sent'];
const MAX_COURSE_NUMBER = 20;

export async function updateTabItemSeatCourse(
  ctx: RequestContext,
  tabId: string,
  itemId: string,
  input: UpdateTabItemSeatCourseInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateTabItemSeatCourse');
      if (check.isDuplicate) return { result: check.originalResult as Record<string, unknown>, events: [] };
    }

    // Fetch item + tab party_size in a single query to validate seat bounds
    const rows = await tx.execute(
      sql`SELECT i.id, i.tab_id, i.status, i.seat_number, i.course_number,
                 t.party_size, t.status AS tab_status
          FROM fnb_tab_items i
          JOIN fnb_tabs t ON t.id = i.tab_id AND t.tenant_id = i.tenant_id
          WHERE i.id = ${itemId} AND i.tab_id = ${tabId} AND i.tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) throw new TabItemNotFoundError(itemId);

    const item = items[0]!;
    if (!MOVABLE_STATUSES.includes(item.status as string)) {
      throw new TabItemStatusConflictError(itemId, item.status as string, 'move');
    }

    const oldSeatNumber = Number(item.seat_number);
    const oldCourseNumber = Number(item.course_number);
    const newSeatNumber = input.seatNumber ?? oldSeatNumber;
    const newCourseNumber = input.courseNumber ?? oldCourseNumber;

    // Validate seat against party size
    const partySize = Number(item.party_size) || 1;
    if (newSeatNumber > partySize) {
      throw new ValidationError('Validation failed', [
        { field: 'seatNumber', message: `Seat ${newSeatNumber} exceeds party size of ${partySize}` },
      ]);
    }

    // Guard against absurd course numbers
    if (newCourseNumber > MAX_COURSE_NUMBER) {
      throw new ValidationError('Validation failed', [
        { field: 'courseNumber', message: `Course number cannot exceed ${MAX_COURSE_NUMBER}` },
      ]);
    }

    // No-op if nothing actually changed
    if (newSeatNumber === oldSeatNumber && newCourseNumber === oldCourseNumber) {
      return { result: item, events: [] };
    }

    // If moving to a new course, ensure the course record exists
    if (newCourseNumber !== oldCourseNumber) {
      await tx.execute(
        sql`INSERT INTO fnb_tab_courses (id, tenant_id, tab_id, course_number, course_name, course_status)
            VALUES (gen_random_uuid(), ${ctx.tenantId}, ${tabId}, ${newCourseNumber},
                    'Course ' || ${newCourseNumber}::text, 'unsent')
            ON CONFLICT (tab_id, course_number) DO NOTHING`,
      );
    }

    const [updated] = await tx.execute(
      sql`UPDATE fnb_tab_items
          SET seat_number = ${newSeatNumber},
              course_number = ${newCourseNumber},
              updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEM_MOVED, {
      tabId,
      itemId,
      locationId: ctx.locationId,
      oldSeatNumber,
      newSeatNumber,
      oldCourseNumber,
      newCourseNumber,
      movedBy: ctx.user.id,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateTabItemSeatCourse', updated as Record<string, unknown>);
    }

    return { result: updated as Record<string, unknown>, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tab_item.moved', 'fnb_tab_items', itemId);
  return result;
}
