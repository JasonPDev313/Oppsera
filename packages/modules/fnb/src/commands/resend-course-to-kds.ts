/**
 * Resend Course to KDS — recovery path for courses that are already 'sent'
 * but missing kitchen tickets.
 *
 * Uses the same prepareCourseDispatch as sendCourse, but does NOT modify
 * course or tab status (they're already 'sent'/'sent_to_kitchen').
 *
 * Tickets are created atomically in one publishWithOutbox transaction.
 * Idempotent via deterministic clientRequestId per tab+course+station.
 */

import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { logger } from '@oppsera/core/observability';
import { fnbKitchenTickets, fnbKitchenTicketItems } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { FNB_EVENTS } from '../events/types';
import {
  prepareCourseDispatch,
  recordDispatchAttempt,
  emptyDispatchResult,
} from './dispatch-course-to-kds';
import type { DispatchCourseResult } from './dispatch-course-to-kds';

export interface ResendCourseInput {
  tabId: string;
  courseNumber: number;
  /** Link to the original failed attempt for traceability */
  priorAttemptId?: string;
}

export type ResendCourseResult = DispatchCourseResult;

export async function resendCourseToKds(
  ctx: RequestContext,
  input: ResendCourseInput,
): Promise<ResendCourseResult> {
  const startMs = Date.now();
  const dispatch = emptyDispatchResult();

  // ── Phase 1: Pre-transaction preparation ──────────────────────
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
    await recordDispatchAttempt(
      ctx.tenantId,
      { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_resend', priorAttemptId: input.priorAttemptId },
      dispatch, startMs,
    );
    return dispatch;
  }

  // Merge prep results
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
    dispatch.status = 'routing_failed';
    dispatch.failureStage = 'routing';
    dispatch.errors.push(...prep.errors);
    await recordDispatchAttempt(
      ctx.tenantId,
      { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_resend', priorAttemptId: input.priorAttemptId },
      dispatch, startMs,
    );
    return dispatch;
  }

  dispatch.stationIds = Array.from(prep.stationGroups.keys());

  // ── Phase 2: Atomic transaction (tickets only, no course status change) ──
  try {
    const effectiveCtx = prep.effectiveLocationId !== ctx.locationId
      ? { ...ctx, locationId: prep.effectiveLocationId } as RequestContext
      : ctx;

    const txResult = await publishWithOutbox(effectiveCtx, async (tx) => {
      const events = [];
      const ticketIds: string[] = [];
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

        // Per-ticket idempotency — skip if ticket already exists
        const ticketIdem = await checkIdempotency(tx, ctx.tenantId, clientRequestId, 'createKitchenTicket');
        if (ticketIdem.isDuplicate) {
          dispatch.diagnosis.push(`Ticket for station ${stationId}: already exists (idempotency)`);
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

        // Save per-ticket idempotency
        await saveIdempotencyKey(tx, ctx.tenantId, clientRequestId, 'createKitchenTicket', ticket);

        // Send tracking
        const sendToken = `kds-send-${ticket!.id}-${stationId}-resend`;
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
            ${sendToken}, ${'resend'}, ${'routing_rule'},
            ${'sent'}, ${ticketItems.length}, ${prep.tab.tabType ?? null},
            ${prep.tab.businessDate}, NOW(), NOW(), NOW(), NOW()
          )
        `);

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
        dispatch.diagnosis.push(`Ticket #${ticketNumber} created (resend) for station ${stationName} (${ticketItems.length} items)`);

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

      return { result: { ticketIds }, events };
    });

    const result = txResult as { ticketIds: string[] };
    dispatch.status = 'succeeded';
    dispatch.ticketsCreated = result.ticketIds.length;
    dispatch.ticketIds = result.ticketIds;

    logger.info('[kds] resendCourseToKds: atomic dispatch succeeded', {
      domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId,
      courseNumber: input.courseNumber, ticketsCreated: result.ticketIds.length,
      durationMs: Date.now() - startMs,
    });
  } catch (err) {
    dispatch.status = 'ticket_create_failed';
    dispatch.failureStage = 'transaction';
    dispatch.errors.push(err instanceof Error ? err.message : String(err));

    logger.error('[kds] resendCourseToKds: atomic transaction failed', {
      domain: 'kds', tenantId: ctx.tenantId, tabId: input.tabId,
      courseNumber: input.courseNumber,
      error: { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
    });
  }

  // Record attempt
  await recordDispatchAttempt(
    ctx.tenantId,
    { tabId: input.tabId, courseNumber: input.courseNumber, source: 'fnb_course_resend', priorAttemptId: input.priorAttemptId },
    dispatch, startMs,
  );

  return dispatch;
}
