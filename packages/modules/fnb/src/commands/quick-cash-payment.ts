import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import type { DeferredPublishResult } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { AppError } from '@oppsera/shared';
import { fnbTableLiveStatus } from '@oppsera/db';
import { FNB_EVENTS } from '../events/types';
import type { PaymentStartedPayload, TenderAppliedPayload, PaymentCompletedPayload } from '../events/types';
import { TabNotFoundError, TabStatusConflictError } from '../errors';
import type { QuickCashPaymentInput } from '../validation';

export interface QuickCashOptions {
  deferDispatch?: boolean;
}

export interface QuickCashDeferredResult {
  result: Record<string, unknown>;
  dispatchEvents: () => Promise<void>;
}

// Overload: deferDispatch = true
export function quickCashPayment(
  ctx: RequestContext,
  locationId: string,
  input: QuickCashPaymentInput,
  options: QuickCashOptions & { deferDispatch: true },
): Promise<QuickCashDeferredResult>;
// Overload: default
export function quickCashPayment(
  ctx: RequestContext,
  locationId: string,
  input: QuickCashPaymentInput,
  options?: QuickCashOptions,
): Promise<Record<string, unknown>>;
/**
 * Quick cash payment — combines start-session + record-tender + complete-session
 * into a single publishWithOutbox call. Reduces 3 sequential HTTP round-trips
 * and 3 inline event dispatches down to 1 of each.
 *
 * Only valid for exact/full cash payments (no split, no card, no tips).
 */
export async function quickCashPayment(
  ctx: RequestContext,
  locationId: string,
  input: QuickCashPaymentInput,
  options?: QuickCashOptions,
): Promise<Record<string, unknown> | QuickCashDeferredResult> {
  const tenderId = crypto.randomUUID();

  const publishResult = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'quickCashPayment');
      if (check.isDuplicate) return { result: check.originalResult as Record<string, unknown>, events: [] };
    }

    // ── 1. Lock tab + validate status ──
    const tabRows = await tx.execute(
      sql`SELECT id, status, table_id FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
          FOR UPDATE`,
    );
    const tabs = Array.from(tabRows as Iterable<Record<string, unknown>>);
    if (tabs.length === 0) throw new TabNotFoundError(input.tabId);

    const tab = tabs[0]!;
    const tabStatus = tab.status as string;
    const tableId = tab.table_id as string | null;
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

    // ── 2. Create session (already completed) ──
    const [created] = await tx.execute(
      sql`INSERT INTO fnb_payment_sessions (
            tenant_id, tab_id, order_id, status,
            total_amount_cents, paid_amount_cents, remaining_amount_cents,
            pre_payment_tab_status, completed_at
          )
          VALUES (
            ${ctx.tenantId}, ${input.tabId}, ${input.orderId}, 'completed',
            ${input.totalAmountCents}, ${input.amountCents}, 0,
            ${tabStatus}, NOW()
          )
          RETURNING *`,
    );
    const session = created as Record<string, unknown>;
    const sessionId = session.id as string;

    // ── 3. Close tab ──
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'closed', closed_at = NOW(), updated_at = NOW(), version = version + 1
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    // ── 4. Clear table live status to 'dirty' ──
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

    // ── 5. Build all 3 events in a single batch ──
    const events = [
      buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_STARTED, {
        paymentSessionId: sessionId,
        tabId: input.tabId,
        orderId: input.orderId,
        locationId,
        totalAmountCents: input.totalAmountCents,
      } satisfies PaymentStartedPayload as unknown as Record<string, unknown>),
      buildEventFromContext(ctx, FNB_EVENTS.TENDER_APPLIED, {
        paymentSessionId: sessionId,
        tenderId,
        tabId: input.tabId,
        orderId: input.orderId,
        locationId,
        amountCents: input.amountCents,
        tenderType: 'cash',
      } satisfies TenderAppliedPayload as unknown as Record<string, unknown>),
      buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_COMPLETED, {
        paymentSessionId: sessionId,
        tabId: input.tabId,
        orderId: input.orderId,
        locationId,
        totalTendersCents: input.amountCents,
        changeCents: input.changeCents ?? 0,
      } satisfies PaymentCompletedPayload as unknown as Record<string, unknown>),
    ];

    const quickResult = {
      sessionId,
      tenderId,
      tabId: input.tabId,
      orderId: input.orderId,
      paidAmountCents: input.amountCents,
      remainingAmountCents: 0,
      sessionStatus: 'completed',
      changeCents: input.changeCents ?? 0,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'quickCashPayment', quickResult);
    }

    return { result: quickResult, events };
  }, options?.deferDispatch ? { deferDispatch: true } : undefined);

  if (options?.deferDispatch) {
    const deferred = publishResult as unknown as DeferredPublishResult<Record<string, unknown>>;
    auditLogDeferred(ctx, 'fnb.payment.quick_cash', 'fnb_payment_sessions', deferred.result.sessionId as string);
    return { result: deferred.result, dispatchEvents: deferred.dispatchEvents };
  }

  const result = publishResult as unknown as Record<string, unknown>;
  auditLogDeferred(ctx, 'fnb.payment.quick_cash', 'fnb_payment_sessions', result.sessionId as string);
  return result;
}
