/**
 * Fire Course — marks a course as fired (ready for plating/pickup).
 *
 * Two paths:
 * - Already-sent course → just mark as fired (tickets already exist)
 * - Unsent course → atomic ticket creation + mark as fired in one transaction
 *   (same atomicity guarantee as sendCourse — no ghost-sends)
 *
 * When firing an unsent course, this function pre-computes routing outside
 * the transaction, then creates ALL station tickets + marks the course
 * fired in a single publishWithOutbox transaction.
 */

import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { withTenant, fnbTabs, fnbTabCourses, fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { FireCourseInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TabNotFoundError, CourseNotFoundError, CourseStatusConflictError } from '../errors';
import {
  prepareCourseDispatch,
  recordDispatchAttempt,
  emptyDispatchResult,
} from './dispatch-course-to-kds';
import type { DispatchCourseResult, PreparedDispatch } from './dispatch-course-to-kds';
import { KdsDispatchError } from './send-course';

const FIREABLE_STATUSES = ['unsent', 'sent'];

export interface FireCourseReturn {
  /** The updated course row */
  course: Record<string, unknown>;
  /** Dispatch result (populated when firing an unsent course; null when firing a sent course) */
  dispatch: DispatchCourseResult | null;
}

export async function fireCourse(
  ctx: RequestContext,
  input: FireCourseInput,
): Promise<FireCourseReturn> {
  const startMs = Date.now();

  // ── Pre-check: is the course unsent? ──────────────────────────────
  // We need to know BEFORE the transaction so we can prepare routing.
  // If it turns out to be 'sent' inside the transaction (raced), we
  // skip ticket creation — tickets already exist from sendCourse.
  let prep: PreparedDispatch | null = null;
  let dispatch: DispatchCourseResult | null = null;
  let prepError: string | null = null;

  const courseStatusRows = await withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ courseStatus: fnbTabCourses.courseStatus })
      .from(fnbTabCourses)
      .where(
        and(
          eq(fnbTabCourses.tenantId, ctx.tenantId),
          eq(fnbTabCourses.tabId, input.tabId),
          eq(fnbTabCourses.courseNumber, input.courseNumber),
        ),
      )
      .limit(1),
  );
  const preCheckStatus = courseStatusRows[0]?.courseStatus;

  if (preCheckStatus === 'unsent') {
    dispatch = emptyDispatchResult();
    try {
      prep = await prepareCourseDispatch(ctx, {
        tabId: input.tabId,
        courseNumber: input.courseNumber,
      });

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

      if (prep.errors.length > 0) {
        prepError = prep.errors.join('; ');
        dispatch.status = 'routing_failed';
        dispatch.failureStage = 'routing';
        dispatch.errors.push(...prep.errors);
      } else {
        dispatch.stationIds = Array.from(prep.stationGroups.keys());
      }
    } catch (err) {
      prepError = err instanceof Error ? err.message : String(err);
      dispatch.status = 'routing_failed';
      dispatch.failureStage = 'preparation';
      dispatch.errors.push(`Preparation failed: ${prepError}`);
    }

    // If routing failed, record attempt and throw 422
    if (prepError) {
      await recordDispatchAttempt(
        ctx.tenantId,
        { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_fire' },
        dispatch, startMs,
      );
      throw new KdsDispatchError(dispatch);
    }
  }

  // ── Atomic transaction ──────────────────────────────────────────────
  try {
    const txResult = await publishWithOutbox(ctx, async (tx): Promise<{
      result: { course: unknown; ticketIds: string[]; isDuplicate: boolean; wasPreviouslyUnsent: boolean };
      events: ReturnType<typeof buildEventFromContext>[];
    }> => {
      const idempotencyCheck = await checkIdempotency(
        tx, ctx.tenantId, input.clientRequestId, 'fireCourse',
      );
      if (idempotencyCheck.isDuplicate) {
        return {
          result: { course: idempotencyCheck.originalResult, ticketIds: [], isDuplicate: true, wasPreviouslyUnsent: false },
          events: [],
        };
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

      // Find and validate course
      const [course] = await tx
        .select()
        .from(fnbTabCourses)
        .where(and(
          eq(fnbTabCourses.tenantId, ctx.tenantId),
          eq(fnbTabCourses.tabId, input.tabId),
          eq(fnbTabCourses.courseNumber, input.courseNumber),
        ))
        .limit(1);
      if (!course) throw new CourseNotFoundError(input.tabId, input.courseNumber);

      if (!FIREABLE_STATUSES.includes(course.courseStatus)) {
        throw new CourseStatusConflictError(input.courseNumber, course.courseStatus, 'fire');
      }

      const wasPreviouslyUnsent = course.courseStatus === 'unsent';
      const events: ReturnType<typeof buildEventFromContext>[] = [];
      const ticketIds: string[] = [];

      // ── If unsent: create tickets atomically (same as sendCourse) ──
      if (wasPreviouslyUnsent && prep && prep.stationGroups.size > 0) {
        const stationCount = prep.stationGroups.size;

        // Batch-increment ticket counter
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

        for (const [stationId, ticketItems] of prep.stationGroups) {
          const clientRequestId = `kds-course-${input.tabId}-${input.courseNumber}-${stationId}`;

          // Per-ticket idempotency
          const ticketIdem = await checkIdempotency(tx, ctx.tenantId, clientRequestId, 'createKitchenTicket');
          if (ticketIdem.isDuplicate) {
            dispatch!.diagnosis.push(`Ticket for station ${stationId}: already exists (idempotency)`);
            ticketIds.push((ticketIdem.originalResult as Record<string, unknown>)?.id as string ?? 'unknown');
            ticketNumberOffset++;
            continue;
          }

          ticketNumberOffset++;
          const ticketNumber = ticketNumberOffset;

          // Prep time
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

          // Insert ticket items
          if (ticketItems.length > 0) {
            await tx
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
              );
          }

          // Save per-ticket idempotency key
          await saveIdempotencyKey(tx, ctx.tenantId, clientRequestId, 'createKitchenTicket', ticket);

          // Send tracking
          const sendToken = `kds-send-${ticket!.id}-${stationId}-fire`;
          const stationName = prep.stationNameMap.get(stationId) ?? stationId;
          await tx.execute(sql`
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
              ${sendToken}, ${'fire'}, ${'routing_rule'},
              ${'sent'}, ${ticketItems.length}, ${prep.tab.tabType ?? null},
              ${prep.tab.businessDate}, NOW(), NOW(), NOW(), NOW()
            )
          `);

          // Send tracking event
          await tx.execute(sql`
            INSERT INTO fnb_kds_send_events (
              id, tenant_id, location_id, send_tracking_id, send_token,
              ticket_id, station_id, event_type, event_at, actor_type,
              new_status, created_at
            ) VALUES (
              gen_ulid(), ${ctx.tenantId}, ${prep.effectiveLocationId},
              (SELECT id FROM fnb_kds_send_tracking WHERE tenant_id = ${ctx.tenantId} AND send_token = ${sendToken} LIMIT 1),
              ${sendToken},
              ${ticket!.id}, ${stationId},
              ${'sent'}, NOW(), ${'system'}, ${'sent'}, NOW()
            )
          `);

          ticketIds.push(ticket!.id);
          dispatch!.diagnosis.push(`Ticket #${ticketNumber} created (fire) for station ${stationName} (${ticketItems.length} items)`);

          events.push(
            buildEventFromContext(ctx, FNB_EVENTS.TICKET_CREATED, {
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

        // Emit course.sent (tickets are now committed in this tx)
        events.push(buildEventFromContext(ctx, FNB_EVENTS.COURSE_SENT, {
          tabId: input.tabId,
          locationId: tab.locationId,
          courseNumber: input.courseNumber,
        }));
      }

      // ── Mark course as fired ──────────────────────────────────────
      const [updated] = await tx
        .update(fnbTabCourses)
        .set({
          courseStatus: 'fired',
          sentAt: wasPreviouslyUnsent ? new Date() : undefined,
          firedAt: new Date(),
          firedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(fnbTabCourses.id, course.id))
        .returning();

      // Update tab status when firing from unsent
      if (wasPreviouslyUnsent && ['open', 'ordering'].includes(tab.status)) {
        await tx
          .update(fnbTabs)
          .set({
            status: 'sent_to_kitchen',
            version: tab.version + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(fnbTabs.id, input.tabId), eq(fnbTabs.tenantId, ctx.tenantId), eq(fnbTabs.version, tab.version)));
      }

      // Emit course.fired
      events.push(buildEventFromContext(ctx, FNB_EVENTS.COURSE_FIRED, {
        tabId: input.tabId,
        locationId: tab.locationId,
        courseNumber: input.courseNumber,
      }));

      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'fireCourse', updated);

      return { result: { course: updated!, ticketIds, isDuplicate: false, wasPreviouslyUnsent }, events };
    });

    const txData = txResult as unknown as { course: unknown; ticketIds: string[]; isDuplicate: boolean; wasPreviouslyUnsent: boolean };

    if (txData.isDuplicate) {
      if (dispatch) {
        dispatch.status = 'succeeded';
        dispatch.diagnosis.push('Idempotency duplicate — returning original result');
      }
      return { course: txData.course as Record<string, unknown>, dispatch };
    }

    // Update dispatch result on success
    if (dispatch && txData.wasPreviouslyUnsent) {
      dispatch.status = 'succeeded';
      dispatch.ticketsCreated = txData.ticketIds.length;
      dispatch.ticketIds = txData.ticketIds;

      await recordDispatchAttempt(
        ctx.tenantId,
        { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_fire' },
        dispatch, startMs,
      );

      logger.info('[kds] fireCourse: atomic dispatch succeeded (unsent → fired)', {
        domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId,
        courseNumber: input.courseNumber, ticketsCreated: txData.ticketIds.length,
        durationMs: Date.now() - startMs,
      });
    }

    auditLogDeferred(ctx, 'fnb.course.fired', 'fnb_tab_courses', (txData.course as Record<string, unknown>).id as string, undefined, {
      tabId: input.tabId,
      courseNumber: input.courseNumber,
      ticketsCreated: txData.ticketIds.length,
    });

    return { course: txData.course as Record<string, unknown>, dispatch };
  } catch (err) {
    // Re-throw KdsDispatchError as-is
    if (err instanceof KdsDispatchError) throw err;

    // Re-throw domain errors as-is
    if (err instanceof TabNotFoundError || err instanceof CourseNotFoundError || err instanceof CourseStatusConflictError) {
      throw err;
    }

    // Transaction failed — course stays as-is. Record attempt and throw 422.
    if (dispatch) {
      dispatch.status = 'ticket_create_failed';
      dispatch.failureStage = 'transaction';
      dispatch.errors.push(err instanceof Error ? err.message : String(err));
      await recordDispatchAttempt(
        ctx.tenantId,
        { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_fire' },
        dispatch, startMs,
      );

      logger.error('[kds] fireCourse: atomic transaction failed — course stays unsent', {
        domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId,
        courseNumber: input.courseNumber,
        error: { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
      });

      throw new KdsDispatchError(dispatch);
    }

    throw err;
  }
}
