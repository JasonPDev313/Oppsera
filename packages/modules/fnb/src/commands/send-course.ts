/**
 * Send Course — atomic F&B kitchen dispatch.
 *
 * The invariant: "sent to kitchen" means kitchen tickets were committed.
 *
 * Flow:
 * 1. Pre-transaction: load items, enrich, resolve routing, group by station,
 *    fetch prep times (all read-only, pool-safe: 2+1 pattern)
 * 2. If routing yields zero stations → fail immediately, course stays unsent
 * 3. One publishWithOutbox transaction that:
 *    - re-validates course status (unsent) with idempotency
 *    - creates ALL station tickets + ticket items
 *    - creates KDS send-tracking rows
 *    - marks course as 'sent'
 *    - updates tab status to 'sent_to_kitchen'
 *    - emits course.sent + ticket.created events
 * 4. If any write fails, nothing commits — course stays unsent
 * 5. Records a durable dispatch attempt (even on failure)
 */

import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbTabs, fnbTabCourses, fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { SendCourseInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, CourseNotFoundError, CourseStatusConflictError } from '../errors';
import {
  prepareCourseDispatch,
  recordDispatchAttempt,
  emptyDispatchResult,
} from './dispatch-course-to-kds';
import type { DispatchCourseResult } from './dispatch-course-to-kds';
import { withEffectiveLocationId } from '../helpers/venue-location';

// ── Return type ────────────────────────────────────────────────────

export interface SendCourseReturn {
  /** The updated course row (null if dispatch failed before transaction) */
  course: Record<string, unknown> | null;
  /** Full dispatch result with attemptId, tickets, diagnosis */
  dispatch: DispatchCourseResult;
}

// ── KDS Dispatch Failure ───────────────────────────────────────────
// Thrown as 422 by the route handler so POS doesn't swallow it as 409

export class KdsDispatchError extends Error {
  public readonly statusCode = 422;
  public readonly dispatch: DispatchCourseResult;

  constructor(dispatch: DispatchCourseResult) {
    super(`KDS dispatch failed: ${dispatch.errors.join('; ') || 'unknown error'}`);
    this.name = 'KdsDispatchError';
    this.dispatch = dispatch;
  }
}

// ── Main function ──────────────────────────────────────────────────

export async function sendCourse(
  ctx: RequestContext,
  input: SendCourseInput,
): Promise<SendCourseReturn> {
  const startMs = Date.now();
  const dispatch = emptyDispatchResult();

  // ── Phase 1: Pre-transaction preparation (read-only) ──────────
  let prep;
  try {
    prep = await prepareCourseDispatch(ctx, {
      tabId: input.tabId,
      courseNumber: input.courseNumber,
    });
  } catch (err) {
    dispatch.status = 'routing_failed';
    dispatch.failureStage = 'preparation';
    dispatch.errors.push(`Preparation failed: ${err instanceof Error ? err.message : String(err)}`);
    await recordDispatchAttempt(ctx.tenantId, { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_send' }, dispatch, startMs);
    throw new KdsDispatchError(dispatch);
  }

  // Merge prep results into dispatch
  dispatch.diagnosis.push(...prep.diagnosis);
  dispatch.itemCount = prep.itemCount;
  dispatch.itemsRouted = prep.itemsRouted;
  dispatch.itemsUnrouted = prep.itemsUnrouted;

  if (prep.tab) {
    dispatch.orderId = prep.tab.primaryOrderId ?? null;
    dispatch.tabType = prep.tab.tabType ?? null;
    dispatch.businessDate = prep.tab.businessDate;
    dispatch.effectiveKdsLocationId = prep.effectiveLocationId || null;
  }

  // If routing found zero stations → fail immediately, course stays unsent
  if (prep.errors.length > 0) {
    dispatch.status = 'routing_failed';
    dispatch.failureStage = 'routing';
    dispatch.errors.push(...prep.errors);
    await recordDispatchAttempt(ctx.tenantId, { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_send' }, dispatch, startMs);
    throw new KdsDispatchError(dispatch);
  }

  // No dispatchable items — refuse to advance course state.
  // This prevents ghost-sends where drafts weren't persisted yet (items only
  // in Zustand, not in fnb_tab_items) or all items are voided/served.
  // The course stays 'unsent' so the POS can retry after persisting.
  if (prep.itemCount === 0) {
    dispatch.status = 'routing_failed';
    dispatch.failureStage = 'no_items';
    dispatch.errors.push('No dispatchable items in database — course stays unsent. Items may not have been persisted yet.');
    dispatch.diagnosis.push('BLOCKED: 0 items found for this course — refusing ghost-send');
    await recordDispatchAttempt(ctx.tenantId, { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_send' }, dispatch, startMs);
    logger.warn('[kds] sendCourse: refusing ghost-send — 0 items in DB for course', {
      domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId, courseNumber: input.courseNumber,
    });
    throw new KdsDispatchError(dispatch);
  }

  dispatch.stationIds = Array.from(prep.stationGroups.keys());

  // ── Phase 2: Atomic transaction ────────────────────────────────
  try {
    // Use effectiveCtx so the outbox envelope location matches where tickets are stored.
    const effectiveCtx = withEffectiveLocationId(ctx, prep.effectiveLocationId);
    const txResult = await publishWithOutbox(effectiveCtx, async (tx): Promise<{ result: { course: unknown; ticketIds: string[]; isDuplicate: boolean }; events: ReturnType<typeof buildEventFromContext>[] }> => {
      // 1. sendCourse-level idempotency
      const idemCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'sendCourse');
      if (idemCheck.isDuplicate) {
        return { result: { course: idemCheck.originalResult, ticketIds: [], isDuplicate: true }, events: [] };
      }

      // 2. Re-validate tab inside transaction for consistency
      const [tab] = await tx
        .select()
        .from(fnbTabs)
        .where(and(eq(fnbTabs.id, input.tabId), eq(fnbTabs.tenantId, ctx.tenantId)))
        .limit(1);
      if (!tab) throw new TabNotFoundError(input.tabId);

      // 3. Re-validate course status inside transaction
      const [course] = await tx
        .select()
        .from(fnbTabCourses)
        .where(
          and(
            eq(fnbTabCourses.tenantId, ctx.tenantId),
            eq(fnbTabCourses.tabId, input.tabId),
            eq(fnbTabCourses.courseNumber, input.courseNumber),
          ),
        )
        .limit(1);
      if (!course) throw new CourseNotFoundError(input.tabId, input.courseNumber);
      if (course.courseStatus !== 'unsent') {
        throw new CourseStatusConflictError(input.courseNumber, course.courseStatus, 'send');
      }

      const events = [];
      const ticketIds: string[] = [];
      const stationCount = prep.stationGroups.size;

      // 4. Batch-increment ticket counter for N stations in one round-trip
      const counterResult = await tx.execute(
        sql`INSERT INTO fnb_kitchen_ticket_counters (tenant_id, location_id, business_date, last_number)
            VALUES (${ctx.tenantId}, ${prep.effectiveLocationId}, ${prep.tab.businessDate}, ${stationCount})
            ON CONFLICT (tenant_id, location_id, business_date)
            DO UPDATE SET last_number = fnb_kitchen_ticket_counters.last_number + ${stationCount}
            RETURNING last_number`,
      );
      const counterRow = Array.from(counterResult as Iterable<Record<string, unknown>>)[0];
      if (!counterRow) throw new Error('Ticket counter UPSERT returned no rows');
      const lastNumber = Number(counterRow.last_number);
      let ticketNumberOffset = lastNumber - stationCount;

      // 5. Create tickets + items for each station
      for (const [stationId, ticketItems] of prep.stationGroups) {
        const clientRequestId = `kds-course-${input.tabId}-${input.courseNumber}-${stationId}`;

        // Per-ticket idempotency — skip if this station's ticket already exists (e.g. from old consumer)
        const ticketIdem = await checkIdempotency(tx, ctx.tenantId, clientRequestId, 'createKitchenTicket');
        if (ticketIdem.isDuplicate) {
          dispatch.diagnosis.push(`Ticket for station ${stationId}: already exists (idempotency)`);
          ticketIds.push((ticketIdem.originalResult as Record<string, unknown>)?.id as string ?? 'unknown');
          continue;
        }

        ticketNumberOffset++;
        const ticketNumber = ticketNumberOffset;

        // Compute estimatedPickupAt from max prep time across this ticket's items
        let estimatedPickupAt: Date | null = null;
        let maxPrepSeconds = 0;
        for (const ti of ticketItems) {
          const ps = prep.prepTimeMap.get(ti.orderLineId) ?? 0;
          if (ps > maxPrepSeconds) maxPrepSeconds = ps;
        }
        if (maxPrepSeconds > 0) {
          estimatedPickupAt = new Date(Date.now() + maxPrepSeconds * 1000);
        }

        // Insert ticket
        const [ticket] = await tx
          .insert(fnbKitchenTickets)
          .values({
            tenantId: ctx.tenantId,
            locationId: prep.effectiveLocationId,
            tabId: input.tabId,
            orderId: prep.tab.primaryOrderId ?? null,
            ticketNumber,
            courseNumber: input.courseNumber,
            status: 'pending',
            businessDate: prep.tab.businessDate,
            sentBy: ctx.user.id,
            tableNumber: prep.tableNumber,
            serverName: null,
            priorityLevel: 0,
            orderType: prep.tab.tabType ?? null,
            channel: 'pos',
            customerName: null,
            estimatedPickupAt,
            version: 1,
          })
          .returning();

        // Parallelize independent writes — items, idempotency key, and tracking
        // all depend only on ticket.id (from step above), not on each other.
        const sendToken = `kds-send-${ticket!.id}-${stationId}-initial`;
        const stationName = prep.stationNameMap.get(stationId) ?? stationId;

        const [, , trackingRows] = await Promise.all([
          // Insert ticket items
          ticketItems.length > 0
            ? tx
                .insert(fnbKitchenTicketItems)
                .values(
                  ticketItems.map((item) => ({
                    tenantId: ctx.tenantId,
                    ticketId: ticket!.id,
                    orderLineId: item.orderLineId,
                    itemStatus: 'pending' as const,
                    stationId: item.stationId,
                    itemName: item.itemName,
                    modifierSummary: item.modifierSummary ?? null,
                    specialInstructions: item.specialInstructions ?? null,
                    seatNumber: item.seatNumber ?? null,
                    courseName: item.courseName ?? null,
                    quantity: String(item.quantity ?? 1),
                    isRush: false,
                    isAllergy: false,
                    isVip: false,
                    routingRuleId: item.routingRuleId ?? null,
                    kitchenLabel: null,
                    itemColor: null,
                    priorityLevel: 0,
                    estimatedPrepSeconds: prep.prepTimeMap.get(item.orderLineId) ?? null,
                  })),
                )
            : Promise.resolve(null),
          // Save per-ticket idempotency key
          saveIdempotencyKey(tx, ctx.tenantId, clientRequestId, 'createKitchenTicket', ticket),
          // Send tracking — RETURNING id for the event INSERT below
          tx.execute(sql`
            INSERT INTO fnb_kds_send_tracking (
              id, tenant_id, location_id, order_id, ticket_id, ticket_number,
              course_number, station_id, station_name,
              employee_id, employee_name,
              send_token, send_type, routing_reason,
              status, item_count, order_type,
              business_date, queued_at, sent_at, created_at, updated_at
            ) VALUES (
              gen_ulid(), ${ctx.tenantId}, ${prep.effectiveLocationId},
              ${prep.tab.primaryOrderId ?? null}, ${ticket!.id}, ${ticketNumber},
              ${input.courseNumber}, ${stationId}, ${stationName},
              ${ctx.user.id}, ${ctx.user.email ?? 'System'},
              ${sendToken}, ${'initial'}, ${'routing_rule'},
              ${'sent'}, ${ticketItems.length}, ${prep.tab.tabType ?? null},
              ${prep.tab.businessDate}, NOW(), NOW(), NOW(), NOW()
            )
            RETURNING id
          `),
        ]);
        const trackingId = (Array.from(trackingRows as Iterable<Record<string, unknown>>)[0])?.id as string | undefined;
        if (!trackingId) throw new Error('KDS send tracking INSERT returned no id');

        // Send tracking event — depends on trackingId from above, must be sequential
        await tx.execute(sql`
          INSERT INTO fnb_kds_send_events (
            id, tenant_id, location_id, send_tracking_id, send_token,
            ticket_id, station_id, event_type, event_at, actor_type,
            new_status, created_at
          ) VALUES (
            gen_ulid(), ${ctx.tenantId}, ${prep.effectiveLocationId},
            ${trackingId},
            ${sendToken},
            ${ticket!.id}, ${stationId},
            ${'sent'}, NOW(), ${'system'}, ${'sent'}, NOW()
          )
        `);

        ticketIds.push(ticket!.id);
        dispatch.diagnosis.push(`Ticket #${ticketNumber} created for station ${stationName} (${ticketItems.length} items)`);

        // Build ticket.created event
        events.push(
          buildEventFromContext(effectiveCtx, FNB_EVENTS.TICKET_CREATED, {
            ticketId: ticket!.id,
            locationId: prep.effectiveLocationId,
            tabId: input.tabId,
            orderId: prep.tab.primaryOrderId ?? null,
            ticketNumber,
            itemCount: ticketItems.length,
            businessDate: prep.tab.businessDate,
            priorityLevel: 0,
            orderType: prep.tab.tabType,
            channel: 'pos',
            routedItemCount: ticketItems.length,
          }),
        );
      }

      // 6. Mark course as sent
      const [updatedCourse] = await tx
        .update(fnbTabCourses)
        .set({ courseStatus: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(fnbTabCourses.id, course.id))
        .returning();

      // 7. Update tab status if still 'open' or 'ordering'
      if (['open', 'ordering'].includes(tab.status)) {
        await tx
          .update(fnbTabs)
          .set({ status: 'sent_to_kitchen', version: tab.version + 1, updatedAt: new Date() })
          .where(and(eq(fnbTabs.id, input.tabId), eq(fnbTabs.tenantId, ctx.tenantId), eq(fnbTabs.version, tab.version)));
      }

      // 8. Course.sent event
      events.push(
        buildEventFromContext(effectiveCtx, FNB_EVENTS.COURSE_SENT, {
          tabId: input.tabId,
          locationId: prep.effectiveLocationId,
          courseNumber: input.courseNumber,
        }),
      );

      // 9. Save sendCourse idempotency key
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'sendCourse', updatedCourse);

      return { result: { course: updatedCourse!, ticketIds, isDuplicate: false }, events };
    });

    // publishWithOutbox returns the `result` value from the callback
    const txData = txResult as unknown as { course: unknown; ticketIds: string[]; isDuplicate: boolean };

    // Handle idempotency duplicate
    if (txData.isDuplicate) {
      dispatch.status = 'succeeded';
      dispatch.diagnosis.push('Idempotency duplicate — returning original result');
      await recordDispatchAttempt(
        ctx.tenantId,
        { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_send' },
        dispatch, startMs,
      );
      return { course: txData.course as Record<string, unknown>, dispatch };
    }

    // Success — update dispatch result
    const result = txData;
    dispatch.status = 'succeeded';
    dispatch.ticketsCreated = result.ticketIds.length;
    dispatch.ticketIds = result.ticketIds;

    // Record successful attempt
    await recordDispatchAttempt(
      ctx.tenantId,
      { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_send' },
      dispatch, startMs,
    );

    // Audit log
    auditLogDeferred(ctx, 'fnb.course.sent', 'fnb_tab_courses', (result.course as Record<string, unknown>).id as string, undefined, {
      tabId: input.tabId,
      courseNumber: input.courseNumber,
      ticketsCreated: result.ticketIds.length,
      stationCount: prep.stationGroups.size,
    });

    logger.info('[kds] sendCourse: atomic dispatch succeeded', {
      domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId,
      courseNumber: input.courseNumber, ticketsCreated: result.ticketIds.length,
      stationCount: prep.stationGroups.size, durationMs: Date.now() - startMs,
    });

    return { course: result.course as Record<string, unknown>, dispatch };
  } catch (err) {
    // Re-throw KdsDispatchError as-is (already has dispatch info)
    if (err instanceof KdsDispatchError) throw err;

    // Re-throw domain errors (TabNotFound, CourseStatusConflict) as-is
    if (err instanceof TabNotFoundError || err instanceof CourseNotFoundError || err instanceof CourseStatusConflictError) {
      throw err;
    }

    // Transaction failed — course stays unsent. Record attempt and throw 422.
    dispatch.status = 'ticket_create_failed';
    dispatch.failureStage = 'transaction';
    dispatch.errors.push(err instanceof Error ? err.message : String(err));
    await recordDispatchAttempt(
      ctx.tenantId,
      { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_send' },
      dispatch, startMs,
    );

    logger.error('[kds] sendCourse: atomic transaction failed — course stays unsent', {
      domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId,
      courseNumber: input.courseNumber,
      error: { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
    });

    throw new KdsDispatchError(dispatch);
  }
}
