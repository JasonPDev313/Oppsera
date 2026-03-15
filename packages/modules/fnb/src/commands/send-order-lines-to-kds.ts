/**
 * Retail POS → KDS dispatch.
 *
 * Hardened to match F&B sendCourse:
 * - Atomic publishWithOutbox transaction (all stations or nothing)
 * - Dispatch attempt tracking via fnb_kds_dispatch_attempts
 * - Ghost-send guard (0 new lines → early return, no partial state)
 * - Prep-time pre-fetch + estimatedPickupAt
 * - Inline send-tracking inside the atomic transaction
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orderLines, fnbKitchenTicketItems, fnbKitchenTickets } from '@oppsera/db';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems, getStationPrepTimesForItems, resolveKdsLocationId } from '../services/kds-routing-engine';
import type { RoutableItem, CatalogChainEntry } from '../services/kds-routing-engine';
import { extractModifierIds, formatModifierSummary } from '../helpers/kds-modifier-helpers';
import { recordDispatchAttempt, emptyDispatchResult } from './dispatch-course-to-kds';
import type { DispatchCourseResult } from './dispatch-course-to-kds';
import { FNB_EVENTS } from '../events/types';
import type { KdsOrderType } from '../validation';

const KDS_ITEM_TYPES = ['food', 'beverage'];

interface OrderLineRow {
  id: string;
  catalogItemId: string;
  catalogItemName: string;
  subDepartmentId: string | null;
  qty: string;
  modifiers: unknown;
  specialInstructions: string | null;
  seatNumber: number | null;
}

export interface RetailKdsSendResult {
  sentCount: number;
  failedCount: number;
  totalStations: number;
  dispatch: DispatchCourseResult;
  /** Non-critical background work (dispatch attempt tracking). Use waitUntil() in API routes to keep Vercel alive. */
  pendingWork: Promise<unknown> | null;
}

/**
 * Sends unsent food/beverage order lines to KDS — does NOT change order status.
 *
 * 1. Fetches food/bev lines for the order
 * 2. Filters out lines that already have KDS ticket items
 * 3. Routes new lines to stations via the routing engine
 * 4. Creates ALL station tickets atomically via publishWithOutbox
 * 5. Records a durable dispatch attempt (even on failure)
 *
 * Returns the count of newly sent items + full dispatch diagnostics.
 */
export async function sendOrderLinesToKds(
  ctx: RequestContext,
  orderId: string,
  businessDate: string,
  orderType?: KdsOrderType,
): Promise<RetailKdsSendResult> {
  const startMs = Date.now();
  const timings: Record<string, number> = {};
  const dispatch = emptyDispatchResult();
  dispatch.orderId = orderId;
  dispatch.businessDate = businessDate;

  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  // ── Phase 1: Pre-transaction preparation (read-only) ──────────

  // 1. Fetch food/beverage order lines + already-sent check in one connection
  const { lines, alreadySentIds } = await withTenant(ctx.tenantId, async (tx) => {
    const fetchedLines: OrderLineRow[] = await tx
      .select({
        id: orderLines.id,
        catalogItemId: orderLines.catalogItemId,
        catalogItemName: orderLines.catalogItemName,
        subDepartmentId: orderLines.subDepartmentId,
        qty: orderLines.qty,
        modifiers: orderLines.modifiers,
        specialInstructions: orderLines.specialInstructions,
        seatNumber: orderLines.seatNumber,
      })
      .from(orderLines)
      .where(
        and(
          eq(orderLines.tenantId, ctx.tenantId),
          eq(orderLines.orderId, orderId),
          inArray(orderLines.itemType, KDS_ITEM_TYPES),
        ),
      ) as OrderLineRow[];

    if (!fetchedLines.length) {
      return { lines: fetchedLines, alreadySentIds: new Set<string>() };
    }

    const lineIds = fetchedLines.map((l) => l.id);
    const existingTicketItems = await tx
      .select({ orderLineId: fnbKitchenTicketItems.orderLineId })
      .from(fnbKitchenTicketItems)
      .where(
        and(
          eq(fnbKitchenTicketItems.tenantId, ctx.tenantId),
          inArray(fnbKitchenTicketItems.orderLineId, lineIds),
        ),
      );

    return {
      lines: fetchedLines,
      alreadySentIds: new Set(
        (existingTicketItems as Array<{ orderLineId: string }>).map((r) => r.orderLineId),
      ),
    };
  });

  timings.fetchLinesMs = Date.now() - startMs;

  if (!lines.length) {
    logger.debug('[kds] sendOrderLinesToKds: no food/bev lines for order', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
    });
    return { sentCount: 0, failedCount: 0, totalStations: -1, dispatch, pendingWork: null };
  }

  const newLines = lines.filter((l) => !alreadySentIds.has(l.id));
  if (!newLines.length) {
    logger.debug('[kds] sendOrderLinesToKds: all lines already sent', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, totalLines: lines.length,
      alreadySent: alreadySentIds.size,
    });
    return { sentCount: 0, failedCount: 0, totalStations: -1, dispatch, pendingWork: null };
  }

  dispatch.itemCount = newLines.length;
  dispatch.diagnosis.push(`Found ${newLines.length} new line(s) to send (${alreadySentIds.size} already sent)`);

  logger.info('[kds] sendOrderLinesToKds: routing new lines', {
    domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
    newLineCount: newLines.length, alreadySent: alreadySentIds.size,
  });

  // 2. KDS stations are ONLY on venues. Resolve site → venue if needed.
  const kdsLocation = await resolveKdsLocationId(ctx.tenantId, ctx.locationId!);
  if (kdsLocation.warning) {
    dispatch.status = 'routing_failed';
    dispatch.failureStage = 'location_resolution';
    dispatch.errors.push(kdsLocation.warning);
    const pendingWork = recordDispatchAttempt(ctx.tenantId, { orderId, source: 'retail_kds_send', locationId: ctx.locationId }, dispatch, startMs).catch(() => {});
    return { sentCount: 0, failedCount: 0, totalStations: 0, dispatch, pendingWork };
  }
  const effectiveLocationId = kdsLocation.locationId;
  dispatch.effectiveKdsLocationId = effectiveLocationId;
  if (kdsLocation.resolved) {
    dispatch.diagnosis.push(`VENUE RESOLVED: ${ctx.locationId} (site) → ${effectiveLocationId} (venue)`);
  }
  dispatch.diagnosis.push(`Location: ${effectiveLocationId}`);
  timings.resolveLocationMs = Date.now() - startMs;

  // 3. Build routable items and enrich with catalog hierarchy (+ capture chain map for prep-time reuse)
  const rawRoutableItems: RoutableItem[] = newLines.map((line) => ({
    orderLineId: line.id,
    catalogItemId: line.catalogItemId,
    subDepartmentId: line.subDepartmentId ?? null,
    modifierIds: extractModifierIds(line.modifiers),
  }));

  const enrichResult = await enrichRoutableItems(ctx.tenantId, rawRoutableItems, { returnChainMap: true });
  const routableItems = enrichResult.items;
  const catalogChainMap: Map<string, CatalogChainEntry> = enrichResult.chainMap;
  timings.enrichMs = Date.now() - startMs;

  // 4. Bulk-resolve stations using the effective location (includes station names + diagnosis — no separate query needed)
  const routingResultSet = await resolveStationRouting(
    { tenantId: ctx.tenantId, locationId: effectiveLocationId, orderType, channel: 'pos' },
    routableItems,
  );
  const routingResults = routingResultSet.results;
  const stationNameMap = routingResultSet.stationNames;
  timings.routingMs = Date.now() - startMs;

  // Count routed/unrouted
  for (const r of routingResults) {
    if (r.stationId) {
      dispatch.itemsRouted++;
    } else {
      dispatch.itemsUnrouted++;
      const itemName = newLines.find((l) => l.id === r.orderLineId)?.catalogItemName ?? r.orderLineId;
      dispatch.diagnosis.push(`UNROUTED: "${itemName}" — no station matched`);
    }
  }

  if (dispatch.itemsUnrouted > 0) {
    logger.warn('[kds] sendOrderLinesToKds: unroutable items', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
      unroutedCount: dispatch.itemsUnrouted, totalLines: newLines.length,
    });
  }

  // 5. Group routed items by station
  const lineMap = new Map(newLines.map((l) => [l.id, l]));

  const stationGroups = new Map<string, Array<{
    orderLineId: string;
    itemName: string;
    modifierSummary: string | null;
    specialInstructions: string | null;
    seatNumber: number | null;
    quantity: number;
    catalogItemId: string;
    subDepartmentId: string | null;
    stationId: string;
  }>>();

  for (const r of routingResults) {
    if (!r.stationId) continue;
    const line = lineMap.get(r.orderLineId);
    if (!line) continue;

    const group = stationGroups.get(r.stationId) ?? [];
    group.push({
      orderLineId: r.orderLineId,
      itemName: line.catalogItemName,
      modifierSummary: formatModifierSummary(line.modifiers),
      specialInstructions: line.specialInstructions ?? null,
      seatNumber: line.seatNumber ?? null,
      quantity: Number(line.qty) || 1,
      catalogItemId: line.catalogItemId,
      subDepartmentId: line.subDepartmentId ?? null,
      stationId: r.stationId,
    });
    stationGroups.set(r.stationId, group);
  }

  if (stationGroups.size === 0) {
    dispatch.status = 'routing_failed';
    dispatch.failureStage = 'routing';
    dispatch.errors.push('No stations resolved — no tickets will be created');
    for (const d of routingResultSet.diagnosis) {
      dispatch.diagnosis.push(d);
    }
    logger.warn('[kds] sendOrderLinesToKds: no stations resolved — no tickets created', {
      domain: 'kds', tenantId: ctx.tenantId, orderId, locationId: ctx.locationId,
    });
    const pendingWork = recordDispatchAttempt(ctx.tenantId, { orderId, source: 'retail_kds_send', locationId: ctx.locationId }, dispatch, startMs).catch(() => {});
    return { sentCount: 0, failedCount: 0, totalStations: 0, dispatch, pendingWork };
  }

  dispatch.stationIds = Array.from(stationGroups.keys());
  dispatch.diagnosis.push(`Grouped into ${stationGroups.size} station(s)`);

  // 6. Pre-fetch prep times — pass catalogChainMap to avoid duplicate catalog hierarchy query
  const prepTimeLookups: Array<{ orderLineId: string; catalogItemId: string; stationId: string }> = [];
  for (const [stationId, items] of stationGroups) {
    for (const item of items) {
      if (item.catalogItemId) {
        prepTimeLookups.push({ orderLineId: item.orderLineId, catalogItemId: item.catalogItemId, stationId });
      }
    }
  }
  const prepTimeMap = await getStationPrepTimesForItems(ctx.tenantId, prepTimeLookups, catalogChainMap);
  timings.prepTimesMs = Date.now() - startMs;

  // ── Phase 2: Atomic transaction ────────────────────────────────
  const effectiveCtx = effectiveLocationId !== ctx.locationId
    ? { ...ctx, locationId: effectiveLocationId } as RequestContext
    : ctx;

  try {
    const clientRequestId = `retail-kds-send-${orderId}-${Date.now()}`;

    const txResult = await publishWithOutbox(effectiveCtx, async (tx): Promise<{ result: { ticketIds: string[]; totalItems: number; isDuplicate: boolean }; events: ReturnType<typeof buildEventFromContext>[] }> => {
      // 1. Top-level idempotency check
      const idemCheck = await checkIdempotency(tx, ctx.tenantId, clientRequestId, 'retailKdsSend');
      if (idemCheck.isDuplicate) {
        return { result: { ticketIds: [], totalItems: 0, isDuplicate: true }, events: [] };
      }

      const events = [];
      const ticketIds: string[] = [];
      let totalItems = 0;
      const stationCount = stationGroups.size;

      // 2. Batch-increment ticket counter for N stations in one round-trip
      const counterResult = await tx.execute(
        sql`INSERT INTO fnb_kitchen_ticket_counters (tenant_id, location_id, business_date, last_number)
            VALUES (${ctx.tenantId}, ${effectiveLocationId}, ${businessDate}, ${stationCount})
            ON CONFLICT (tenant_id, location_id, business_date)
            DO UPDATE SET last_number = fnb_kitchen_ticket_counters.last_number + ${stationCount}
            RETURNING last_number`,
      );
      const counterRow = Array.from(counterResult as Iterable<Record<string, unknown>>)[0];
      if (!counterRow) throw new Error('Ticket counter UPSERT returned no rows');
      const lastNumber = Number(counterRow.last_number);
      let ticketNumberOffset = lastNumber - stationCount;

      // 3. Create tickets for each station, collect items + tracking for batch insert
      const sendTrackingRows: Array<{ ticketId: string; ticketNumber: number; stationId: string; stationName: string; sendToken: string; itemCount: number }> = [];
      const allTicketItemValues: Array<{
        tenantId: string; ticketId: string; orderLineId: string;
        itemStatus: 'pending'; stationId: string; itemName: string;
        modifierSummary: string | null; specialInstructions: string | null;
        seatNumber: number | null; quantity: string;
        isRush: boolean; isAllergy: boolean; isVip: boolean;
        estimatedPrepSeconds: number | null;
      }> = [];

      for (const [stationId, ticketItems] of stationGroups) {
        const sortedLineIds = ticketItems.map((i) => i.orderLineId).sort().join(',');
        const perTicketClientReqId = `retail-kds-send-${orderId}-${stationId}-${sortedLineIds}`;

        // Per-ticket idempotency
        const ticketIdem = await checkIdempotency(tx, ctx.tenantId, perTicketClientReqId, 'createKitchenTicket');
        if (ticketIdem.isDuplicate) {
          dispatch.diagnosis.push(`Ticket for station ${stationId}: already exists (idempotency)`);
          ticketIds.push((ticketIdem.originalResult as Record<string, unknown>)?.id as string ?? 'unknown');
          continue;
        }

        ticketNumberOffset++;
        const ticketNumber = ticketNumberOffset;

        // Compute estimatedPickupAt from max prep time
        let estimatedPickupAt: Date | null = null;
        let maxPrepSeconds = 0;
        for (const ti of ticketItems) {
          const ps = prepTimeMap.get(ti.orderLineId) ?? 0;
          if (ps > maxPrepSeconds) maxPrepSeconds = ps;
        }
        if (maxPrepSeconds > 0) {
          estimatedPickupAt = new Date(Date.now() + maxPrepSeconds * 1000);
        }

        // Insert ticket (needs .returning() for ticketId — must be per-station)
        const [ticket] = await tx
          .insert(fnbKitchenTickets)
          .values({
            tenantId: ctx.tenantId,
            locationId: effectiveLocationId,
            orderId,
            ticketNumber,
            status: 'pending',
            businessDate,
            sentBy: ctx.user.id,
            priorityLevel: 0,
            orderType: orderType ?? null,
            channel: 'pos',
            estimatedPickupAt,
            version: 1,
          })
          .returning();

        // Collect ticket items for batch insert after the loop
        for (const item of ticketItems) {
          allTicketItemValues.push({
            tenantId: ctx.tenantId,
            ticketId: ticket!.id,
            orderLineId: item.orderLineId,
            itemStatus: 'pending' as const,
            stationId: item.stationId,
            itemName: item.itemName,
            modifierSummary: item.modifierSummary ?? null,
            specialInstructions: item.specialInstructions ?? null,
            seatNumber: item.seatNumber ?? null,
            quantity: String(item.quantity ?? 1),
            isRush: false,
            isAllergy: false,
            isVip: false,
            estimatedPrepSeconds: prepTimeMap.get(item.orderLineId) ?? null,
          });
        }

        // Save per-ticket idempotency key
        await saveIdempotencyKey(tx, ctx.tenantId, perTicketClientReqId, 'createKitchenTicket', ticket);

        // Collect send tracking data for batch insert
        const sendToken = `retail-send-${ticket!.id}-${stationId}`;
        const stationName = stationNameMap.get(stationId) ?? stationId;
        sendTrackingRows.push({ ticketId: ticket!.id, ticketNumber, stationId, stationName, sendToken, itemCount: ticketItems.length });

        ticketIds.push(ticket!.id);
        totalItems += ticketItems.length;
        dispatch.diagnosis.push(`Ticket #${ticketNumber} created for station ${stationName} (${ticketItems.length} items)`);

        // Build ticket.created event
        events.push(
          buildEventFromContext(ctx, FNB_EVENTS.TICKET_CREATED, {
            ticketId: ticket!.id,
            locationId: effectiveLocationId,
            orderId,
            ticketNumber,
            itemCount: ticketItems.length,
            businessDate,
            priorityLevel: 0,
            orderType,
            channel: 'pos',
            routedItemCount: ticketItems.length,
          }),
        );
      }

      // 3b. Batch-insert ALL ticket items across stations (1 query instead of N)
      if (allTicketItemValues.length > 0) {
        await tx.insert(fnbKitchenTicketItems).values(allTicketItemValues);
      }

      // 4. Batch-insert send tracking + events (2 queries instead of 2×N)
      if (sendTrackingRows.length > 0) {
        // Build multi-row VALUES for send tracking with RETURNING id
        const trackingValues = sendTrackingRows.map((r) =>
          sql`(gen_ulid(), ${ctx.tenantId}, ${effectiveLocationId},
               ${orderId}, ${r.ticketId}, ${r.ticketNumber},
               ${r.stationId}, ${r.stationName},
               ${ctx.user.id}, ${ctx.user.email ?? 'System'},
               ${r.sendToken}, ${'initial'}, ${'routing_rule'},
               ${'sent'}, ${r.itemCount}, ${orderType ?? null},
               ${businessDate}, NOW(), NOW(), NOW(), NOW())`,
        );
        const trackingResult = await tx.execute(sql`
          INSERT INTO fnb_kds_send_tracking (
            id, tenant_id, location_id, order_id, ticket_id, ticket_number,
            station_id, station_name,
            employee_id, employee_name,
            send_token, send_type, routing_reason,
            status, item_count, order_type,
            business_date, queued_at, sent_at, created_at, updated_at
          ) VALUES ${sql.join(trackingValues, sql`, `)}
          RETURNING id, send_token
        `);

        // Build tracking ID lookup from RETURNING (avoids correlated subquery)
        const trackingIdMap = new Map<string, string>();
        for (const row of Array.from(trackingResult as Iterable<Record<string, unknown>>)) {
          trackingIdMap.set(row.send_token as string, row.id as string);
        }

        // Batch-insert send events using the returned tracking IDs
        const eventValues = sendTrackingRows.map((r) => {
          const trackingId = trackingIdMap.get(r.sendToken) ?? '';
          return sql`(gen_ulid(), ${ctx.tenantId}, ${effectiveLocationId},
                      ${trackingId}, ${r.sendToken},
                      ${r.ticketId}, ${r.stationId},
                      ${'sent'}, NOW(), ${'system'}, ${'sent'}, NOW())`;
        });
        await tx.execute(sql`
          INSERT INTO fnb_kds_send_events (
            id, tenant_id, location_id, send_tracking_id, send_token,
            ticket_id, station_id, event_type, event_at, actor_type,
            new_status, created_at
          ) VALUES ${sql.join(eventValues, sql`, `)}
        `);
      }

      // Save top-level idempotency key
      await saveIdempotencyKey(tx, ctx.tenantId, clientRequestId, 'retailKdsSend', { ticketIds, totalItems });

      return { result: { ticketIds, totalItems, isDuplicate: false }, events };
    });

    const txData = txResult as unknown as { ticketIds: string[]; totalItems: number; isDuplicate: boolean };

    if (txData.isDuplicate) {
      dispatch.status = 'succeeded';
      dispatch.diagnosis.push('Idempotency duplicate — returning original result');
      const pendingWork = recordDispatchAttempt(ctx.tenantId, { orderId, source: 'retail_kds_send', locationId: ctx.locationId }, dispatch, startMs).catch(() => {});
      return { sentCount: 0, failedCount: 0, totalStations: stationGroups.size, dispatch, pendingWork };
    }

    // Success
    dispatch.status = 'succeeded';
    dispatch.ticketsCreated = txData.ticketIds.length;
    dispatch.ticketIds = txData.ticketIds;

    const pendingWork = recordDispatchAttempt(ctx.tenantId, { orderId, source: 'retail_kds_send', locationId: ctx.locationId }, dispatch, startMs).catch(() => {});

    timings.transactionMs = Date.now() - startMs;
    logger.info('[kds] sendOrderLinesToKds: atomic dispatch succeeded', {
      domain: 'kds', tenantId: ctx.tenantId, orderId,
      ticketsCreated: txData.ticketIds.length,
      totalItems: txData.totalItems,
      stationCount: stationGroups.size,
      durationMs: Date.now() - startMs,
      timings,
    });

    return {
      sentCount: txData.totalItems,
      failedCount: 0,
      totalStations: stationGroups.size,
      dispatch,
      pendingWork,
    };
  } catch (err) {
    // Transaction failed — no tickets created (atomic rollback)
    dispatch.status = 'ticket_create_failed';
    dispatch.failureStage = 'transaction';
    dispatch.errors.push(err instanceof Error ? err.message : String(err));

    const pendingWork = recordDispatchAttempt(ctx.tenantId, { orderId, source: 'retail_kds_send', locationId: ctx.locationId }, dispatch, startMs).catch(() => {});

    logger.error('[kds] sendOrderLinesToKds: atomic transaction failed — no tickets created', {
      domain: 'kds', tenantId: ctx.tenantId, orderId,
      error: { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
    });

    return {
      sentCount: 0,
      failedCount: stationGroups.size,
      totalStations: stationGroups.size,
      dispatch,
      pendingWork,
    };
  }
}
