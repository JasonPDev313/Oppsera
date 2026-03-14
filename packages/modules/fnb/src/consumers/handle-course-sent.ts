import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';

export interface CourseSentConsumerData {
  tabId: string;
  locationId: string;
  courseNumber: number;
}

/**
 * Consumer: handles fnb.course.sent.v1 events.
 *
 * DEMOTED (2026-03-14): This consumer no longer creates kitchen tickets.
 * Ticket creation is now atomic inside sendCourse — tickets are committed
 * in the same transaction that marks the course as sent.
 *
 * This consumer now only:
 * 1. Verifies tickets exist (sanity check)
 * 2. Logs if tickets are missing (should never happen with atomic dispatch)
 *
 * Kept alive for:
 * - Audit trail / observability
 * - Future side effects (table status updates, notification broadcasts)
 * - Safety net: if tickets somehow don't exist, logs a critical warning
 */
export async function handleCourseSent(
  tenantId: string,
  data: CourseSentConsumerData,
): Promise<void> {
  try {
    // Quick check: verify tickets exist for this course.
    // With atomic dispatch, they should always exist when this event fires.
    const ticketRows = await withTenant(tenantId, (tx) =>
      tx.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM fnb_kitchen_tickets
        WHERE tenant_id = ${tenantId}
          AND tab_id = ${data.tabId}
          AND course_number = ${data.courseNumber}
      `),
    );

    const row = Array.from(ticketRows as Iterable<Record<string, unknown>>)[0];
    const ticketCount = Number(row?.cnt ?? 0);

    if (ticketCount > 0) {
      logger.info('[kds] handleCourseSent: tickets verified (atomic dispatch)', {
        domain: 'kds', tenantId, tabId: data.tabId,
        courseNumber: data.courseNumber, ticketCount,
      });
    } else {
      // This should never happen with atomic dispatch.
      // If it does, it means a code path is still using the old non-atomic send.
      logger.error('[kds] handleCourseSent: NO TICKETS FOUND — course marked sent but no tickets exist. ' +
        'This indicates a code path bypassed the atomic dispatcher.', {
        domain: 'kds', tenantId, tabId: data.tabId,
        courseNumber: data.courseNumber, locationId: data.locationId,
      });
    }
  } catch (err) {
    // Consumer must never throw
    logger.error('[kds] handleCourseSent: verification failed', {
      domain: 'kds', tenantId, tabId: data.tabId, courseNumber: data.courseNumber,
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
  }
}
