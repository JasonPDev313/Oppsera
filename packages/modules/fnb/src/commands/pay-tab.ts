import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import type { DeferredPublishResult } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { AppError } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { fnbTableLiveStatus } from '@oppsera/db';
import { FNB_EVENTS } from '../events/types';
import type {
  PaymentStartedPayload,
  TenderAppliedPayload,
  PaymentCompletedPayload,
} from '../events/types';
import { TabNotFoundError, TabStatusConflictError, PaymentSessionNotFoundError, PaymentSessionStatusConflictError, CheckAlreadyPaidError } from '../errors';
import type { PayTabInput } from '../validation';

export interface PayTabOptions {
  /** When true, return { result, dispatchEvents } so the caller can schedule via after() */
  deferDispatch?: boolean;
}

export interface PayTabDeferredResult {
  result: Record<string, unknown>;
  dispatchEvents: () => Promise<void>;
}

// Overload: deferDispatch = true → returns { result, dispatchEvents }
export function payTab(
  ctx: RequestContext,
  locationId: string,
  input: PayTabInput,
  options: PayTabOptions & { deferDispatch: true },
): Promise<PayTabDeferredResult>;
// Overload: default → returns result directly
export function payTab(
  ctx: RequestContext,
  locationId: string,
  input: PayTabInput,
  options?: PayTabOptions,
): Promise<Record<string, unknown>>;
/**
 * Unified pay-tab — combines start-session + record-tender + (auto-complete)
 * into a single publishWithOutbox call for ALL tender types.
 *
 * Pre-transaction work (gateway charges, house account validation) must be
 * done by the API route BEFORE calling this command. This command only
 * handles the database transaction and event emission.
 *
 * Supports both:
 * - First payment: creates session, records tender, auto-completes if fully paid
 * - Split payment: reuses existing sessionId, records tender, auto-completes if fully paid
 */
export async function payTab(
  ctx: RequestContext,
  locationId: string,
  input: PayTabInput,
  options?: PayTabOptions,
): Promise<Record<string, unknown> | PayTabDeferredResult> {
  const tenderId = input.tenderId ?? crypto.randomUUID();

  const publishResult = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'payTab');
      if (check.isDuplicate) return { result: check.originalResult as Record<string, unknown>, events: [] };
    }

    const events: EventEnvelope[] = [];
    let sessionId = input.sessionId ?? null;
    let tabId = input.tabId;
    let tableId: string | null = null;
    let tabStatus: string = '';
    let totalCents = input.totalAmountCents;

    // ── 1. Start or reuse session ──────────────────────────────────
    if (!sessionId) {
      // Lock tab + validate status + get table_id in one query
      const tabRows = await tx.execute(
        sql`SELECT id, status, table_id FROM fnb_tabs
            WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            FOR UPDATE`,
      );
      const tabs = Array.from(tabRows as Iterable<Record<string, unknown>>);
      if (tabs.length === 0) throw new TabNotFoundError(input.tabId);

      const tab = tabs[0]!;
      tabStatus = tab.status as string;
      tableId = tab.table_id as string | null;
      const payableStatuses = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested', 'paying'];
      if (!payableStatuses.includes(tabStatus)) {
        throw new TabStatusConflictError(input.tabId, tabStatus, 'start payment on');
      }

      // Guard: reject if an active session already exists
      const activeCheck = await tx.execute(
        sql`SELECT id FROM fnb_payment_sessions
            WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
              AND status IN ('pending', 'in_progress')
            LIMIT 1`,
      );
      const activeRows = Array.from(activeCheck as Iterable<Record<string, unknown>>);
      if (activeRows.length > 0) {
        throw new AppError(
          'DUPLICATE_ACTIVE_SESSION',
          `Tab ${input.tabId} already has an active payment session`,
          409,
        );
      }

      // Create session as 'pending' — will be updated to completed if fully paid
      const [created] = await tx.execute(
        sql`INSERT INTO fnb_payment_sessions (
              tenant_id, tab_id, order_id, status,
              total_amount_cents, paid_amount_cents, remaining_amount_cents,
              pre_payment_tab_status
            )
            VALUES (
              ${ctx.tenantId}, ${input.tabId}, ${input.orderId}, 'pending',
              ${totalCents}, 0, ${totalCents},
              ${tabStatus}
            )
            RETURNING *`,
      );
      const session = created as Record<string, unknown>;
      sessionId = session.id as string;

      // Update tab status to 'paying'
      if (tabStatus !== 'paying') {
        await tx.execute(
          sql`UPDATE fnb_tabs
              SET status = 'paying', updated_at = NOW(), version = version + 1
              WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
        );
      }

      // Emit PAYMENT_STARTED event
      events.push(buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_STARTED, {
        paymentSessionId: sessionId,
        tabId: input.tabId,
        orderId: input.orderId,
        locationId,
        totalAmountCents: totalCents,
      } satisfies PaymentStartedPayload as unknown as Record<string, unknown>));
    } else {
      // ── Reuse existing session (split payment) ──
      const sessions = await tx.execute(
        sql`SELECT id, tab_id, order_id, status, total_amount_cents, paid_amount_cents, remaining_amount_cents
            FROM fnb_payment_sessions
            WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}
            FOR UPDATE`,
      );
      const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
      if (rows.length === 0) throw new PaymentSessionNotFoundError(sessionId);

      const session = rows[0]!;
      const status = session.status as string;
      if (status === 'completed') throw new CheckAlreadyPaidError(session.order_id as string);
      if (status === 'failed') {
        throw new PaymentSessionStatusConflictError(sessionId, status, 'record tender on');
      }

      tabId = session.tab_id as string;
      totalCents = Number(session.total_amount_cents);

      // Get table_id for potential table cleanup
      const tabRows = await tx.execute(
        sql`SELECT table_id FROM fnb_tabs
            WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}`,
      );
      const tabArr = Array.from(tabRows as Iterable<Record<string, unknown>>);
      tableId = tabArr[0]?.table_id as string | null;
    }

    // ── 2. Record tender ──────────────────────────────────────────
    // For new sessions we already know the state from the INSERT above —
    // skip the redundant SELECT FOR UPDATE to reduce transaction round-trips.
    let currentPaid: number;
    let sessionTotal: number;
    if (!input.sessionId) {
      // Just created: paid = 0, total = what we inserted
      currentPaid = 0;
      sessionTotal = totalCents;
    } else {
      // Split payment: re-read for CAS (another tender may have updated)
      const sessionRows = await tx.execute(
        sql`SELECT paid_amount_cents, total_amount_cents, status
            FROM fnb_payment_sessions
            WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}
            FOR UPDATE`,
      );
      const sRows = Array.from(sessionRows as Iterable<Record<string, unknown>>);
      currentPaid = Number(sRows[0]!.paid_amount_cents);
      sessionTotal = Number(sRows[0]!.total_amount_cents);
    }
    const newPaid = currentPaid + input.amountCents;
    const newRemaining = sessionTotal - newPaid;

    // Reject overpayment
    if (newRemaining < 0) {
      throw new PaymentSessionStatusConflictError(
        sessionId,
        input.sessionId ? 'in_progress' : 'pending',
        `tender ${input.amountCents} cents (remaining: ${sessionTotal - currentPaid} cents) on`,
      );
    }

    // CAS update prevents double-counting from concurrent tenders
    const updateResult = await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET paid_amount_cents = ${newPaid},
              remaining_amount_cents = ${newRemaining},
              updated_at = NOW()
          WHERE id = ${sessionId}
            AND tenant_id = ${ctx.tenantId}
            AND paid_amount_cents = ${currentPaid}`,
    );
    const updatedCount = Number((updateResult as { count?: number }).count ?? 0);
    if (updatedCount === 0) {
      throw new PaymentSessionStatusConflictError(
        sessionId,
        'in_progress',
        'record tender on (concurrent modification detected — please retry)',
      );
    }

    // Store house account metadata if applicable
    if (input.tenderType === 'house_account' && input.billingAccountId) {
      await tx.execute(
        sql`UPDATE fnb_payment_sessions
            SET house_account_id = ${input.billingAccountId},
                house_customer_id = ${input.customerId ?? null},
                house_signature_data = ${input.signatureData ?? null},
                updated_at = NOW()
            WHERE id = ${sessionId}
              AND tenant_id = ${ctx.tenantId}`,
      );
    }

    // ── 2b. Track seat payments in split_details ──────────────────
    let cumulativePaidSeats: number[] | undefined;
    if (input.seatNumbers && input.seatNumbers.length > 0) {
      // Read existing split_details (may have prior seat payments)
      const detailRows = await tx.execute(
        sql`SELECT split_details FROM fnb_payment_sessions
            WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}`,
      );
      const detailArr = Array.from(detailRows as Iterable<Record<string, unknown>>);
      const existing = (detailArr[0]?.split_details as Record<string, unknown>) ?? {};
      const priorPaidSeats = (existing.paidSeats as number[]) ?? [];
      const priorSeatPayments = (existing.seatPayments as Array<Record<string, unknown>>) ?? [];

      // Guard: reject seats that have already been paid (prevents double-pay from concurrent terminals)
      const alreadyPaid = input.seatNumbers.filter((s) => priorPaidSeats.includes(s));
      if (alreadyPaid.length > 0) {
        throw new AppError(
          'SEATS_ALREADY_PAID',
          `Seat${alreadyPaid.length > 1 ? 's' : ''} ${alreadyPaid.join(', ')} already paid`,
          409,
        );
      }

      const updatedPaidSeats = [...new Set([...priorPaidSeats, ...input.seatNumbers])];
      cumulativePaidSeats = updatedPaidSeats;
      const updatedSeatPayments = [
        ...priorSeatPayments,
        { seatNumbers: input.seatNumbers, tenderId, amountCents: input.amountCents },
      ];

      await tx.execute(
        sql`UPDATE fnb_payment_sessions
            SET split_strategy = 'by_seat',
                split_details = ${JSON.stringify({
                  ...existing,
                  paidSeats: updatedPaidSeats,
                  seatPayments: updatedSeatPayments,
                })}::jsonb,
                updated_at = NOW()
            WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}`,
      );
    }

    // Emit TENDER_APPLIED event
    events.push(buildEventFromContext(ctx, FNB_EVENTS.TENDER_APPLIED, {
      paymentSessionId: sessionId,
      tenderId,
      tabId,
      orderId: input.orderId,
      locationId,
      amountCents: input.amountCents,
      tenderType: input.tenderType,
    } satisfies TenderAppliedPayload as unknown as Record<string, unknown>));

    // ── 3. Auto-complete if fully paid ────────────────────────────
    const isFullyPaid = newRemaining <= 0;
    let sessionStatus = newRemaining <= 0 ? 'completed' : 'in_progress';

    if (isFullyPaid) {
      // Complete session
      await tx.execute(
        sql`UPDATE fnb_payment_sessions
            SET status = 'completed', remaining_amount_cents = 0,
                completed_at = NOW(), updated_at = NOW()
            WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}
              AND status IN ('pending', 'in_progress')`,
      );

      // Close tab
      await tx.execute(
        sql`UPDATE fnb_tabs
            SET status = 'closed', closed_at = NOW(), updated_at = NOW(), version = version + 1
            WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}
              AND status = 'paying'`,
      );

      // Clear table live status to 'dirty'
      if (tableId) {
        await tx
          .update(fnbTableLiveStatus)
          .set({
            status: 'dirty',
            currentTabId: null,
            currentServerUserId: null,
            partySize: null,
            guestNames: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
            eq(fnbTableLiveStatus.tableId, tableId),
          ));
      }

      // Emit PAYMENT_COMPLETED event
      events.push(buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_COMPLETED, {
        paymentSessionId: sessionId,
        tabId,
        orderId: input.orderId,
        locationId,
        totalTendersCents: newPaid,
        changeCents: input.changeCents ?? 0,
      } satisfies PaymentCompletedPayload as unknown as Record<string, unknown>));

      sessionStatus = 'completed';
    }

    const payResult = {
      sessionId,
      tenderId,
      tabId,
      orderId: input.orderId,
      paidAmountCents: newPaid,
      remainingAmountCents: Math.max(0, newRemaining),
      sessionStatus,
      changeCents: input.changeCents ?? 0,
      isFullyPaid,
      ...(cumulativePaidSeats ? { paidSeats: cumulativePaidSeats } : {}),
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'payTab', payResult);
    }

    return { result: payResult, events };
  }, options?.deferDispatch ? { deferDispatch: true } : undefined);

  if (options?.deferDispatch) {
    const deferred = publishResult as unknown as DeferredPublishResult<Record<string, unknown>>;
    auditLogDeferred(ctx, `fnb.payment.pay_tab.${input.tenderType}`, 'fnb_payment_sessions', deferred.result.sessionId as string);
    return { result: deferred.result, dispatchEvents: deferred.dispatchEvents };
  }

  const result = publishResult as unknown as Record<string, unknown>;
  auditLogDeferred(ctx, `fnb.payment.pay_tab.${input.tenderType}`, 'fnb_payment_sessions', result.sessionId as string);
  return result;
}
