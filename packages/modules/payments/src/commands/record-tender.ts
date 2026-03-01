import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError, ConflictError } from '@oppsera/shared';
import { tenders, tenderReversals, orderLines, orderDiscounts, orders } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import type { RecordTenderInput } from '../validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/core/helpers/idempotency';
import {
  fetchOrderForMutation,
  incrementVersion,
} from '@oppsera/core/helpers/optimistic-lock';
import { generateJournalEntry } from '../helpers/gl-journal';
import type { OrderLineForGL } from '../helpers/gl-journal';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

export async function recordTender(
  ctx: RequestContext,
  orderId: string,
  input: RecordTenderInput,
) {
  if (!ctx.locationId) {
    throw new AppError(
      'LOCATION_REQUIRED',
      'X-Location-Id header is required',
      400,
    );
  }

  // clientRequestId is REQUIRED for tenders
  if (!input.clientRequestId) {
    throw new ValidationError(
      'clientRequestId is required for tender operations',
    );
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'recordTender',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    // 1. Fetch order -- must be 'placed'
    const order = await fetchOrderForMutation(
      tx,
      ctx.tenantId,
      orderId,
      'placed',
      input.version,
    );

    // 2. Validate businessDate matches
    if (input.businessDate !== order.businessDate) {
      throw new ValidationError(
        'Business date does not match order business date',
        [
          {
            field: 'businessDate',
            message: `Expected ${order.businessDate}, got ${input.businessDate}`,
          },
        ],
      );
    }

    // 3. Calculate remaining balance — fetch tenders + reversals in parallel
    const [existingTendersRows, existingReversals] = await Promise.all([
      (tx as any)
        .select()
        .from(tenders)
        .where(
          and(
            eq(tenders.tenantId, ctx.tenantId),
            eq(tenders.orderId, orderId),
            eq(tenders.status, 'captured'),
          ),
        ),
      (tx as any)
        .select()
        .from(tenderReversals)
        .where(
          and(
            eq(tenderReversals.tenantId, ctx.tenantId),
            eq(tenderReversals.orderId, orderId),
          ),
        ),
    ]);
    const reversedIds = new Set(
      (existingReversals as any[]).map((r: any) => r.originalTenderId),
    );
    const activeTenders = (existingTendersRows as any[]).filter(
      (t: any) => !reversedIds.has(t.id),
    );

    const totalTendered = activeTenders.reduce(
      (sum: number, t: any) => sum + (t.amount as number),
      0,
    );
    const remaining = order.total - totalTendered;

    if (remaining <= 0) {
      throw new ConflictError('Order is already fully paid');
    }

    // 4. Calculate tender amounts for cash
    const tenderSequence = activeTenders.length + 1;
    const tenderAmount = Math.min(input.amountGiven, remaining);
    const changeGiven = Math.max(0, input.amountGiven - remaining);
    const newTotalTendered = totalTendered + tenderAmount;
    const isFullyPaid = newTotalTendered >= order.total;

    // 5. Insert tender row
    const [created] = await (tx as any)
      .insert(tenders)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        orderId,
        tenderType: input.tenderType,
        tenderSequence,
        amount: tenderAmount,
        tipAmount: input.tipAmount ?? 0,
        changeGiven,
        amountGiven: input.amountGiven,
        currency: 'USD',
        status: 'captured',
        businessDate: input.businessDate,
        shiftId: input.shiftId ?? null,
        posMode: input.posMode ?? null,
        source: 'pos',
        employeeId: input.employeeId,
        terminalId: input.terminalId,
        metadata: input.metadata ?? null,
        surchargeAmountCents: input.surchargeAmountCents ?? 0,
        createdBy: ctx.user.id,
      })
      .returning();

    const tender = created!;

    // 6. Fetch order lines for GL entry
    const lines = await (tx as any)
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId));
    const orderLinesForGL: OrderLineForGL[] = (lines as any[]).map(
      (l: any) => ({
        departmentId: null, // V1: all revenue to single account
        lineGross: l.lineTotal as number,
        lineTax: l.lineTax as number,
        lineNet: (l.lineTotal as number) - (l.lineTax as number),
      }),
    );

    // Build enriched lines for accounting event (V2 adapter)
    const enrichedLines = (lines as any[]).map((l: any) => ({
      catalogItemId: l.catalogItemId as string,
      catalogItemName: l.catalogItemName as string,
      subDepartmentId: (l.subDepartmentId as string) ?? null,
      qty: Number(l.qty),
      extendedPriceCents: l.lineSubtotal as number,
      taxGroupId: (l.taxGroupId as string) ?? null,
      taxAmountCents: l.lineTax as number,
      costCents: (l.costPrice as number) ?? null,
      packageComponents: l.packageComponents ?? null,
    }));

    // 6b. Build discount breakdown by classification for per-classification GL posting
    const discountRows = await (tx as any)
      .select({
        classification: orderDiscounts.discountClassification,
        amount: orderDiscounts.amount,
      })
      .from(orderDiscounts)
      .where(eq(orderDiscounts.orderId, orderId));

    const discountBreakdownMap = new Map<string, number>();
    for (const row of discountRows as { classification: string | null; amount: number }[]) {
      const key = row.classification ?? 'manual_discount';
      discountBreakdownMap.set(key, (discountBreakdownMap.get(key) ?? 0) + row.amount);
    }
    const discountBreakdown = Array.from(discountBreakdownMap.entries()).map(
      ([classification, amountCents]) => ({ classification, amountCents }),
    );

    // 6c. Compute price override loss total from order lines
    const priceOverrideLossRows = await (tx as any)
      .select({
        total: sql<number>`COALESCE(SUM(price_override_discount_cents), 0)::int`,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId));
    const priceOverrideLossCents = (priceOverrideLossRows as any[])[0]?.total ?? 0;

    // 7. Generate legacy GL journal entry (gated behind enableLegacyGlPosting)
    // The new GL pipeline posts via the POS adapter event consumer on tender.recorded.v1.
    // When enableLegacyGlPosting is false, only the new pipeline runs.
    let allocationSnapshot: Record<string, unknown> | null = null;
    let enableLegacyGl = true;
    try {
      const accountingApi = getAccountingPostingApi();
      const acctSettings = await accountingApi.getSettings(ctx.tenantId);
      enableLegacyGl = acctSettings.enableLegacyGlPosting ?? true;
    } catch {
      // AccountingPostingApi not initialized — legacy behavior (keep legacy GL active)
    }

    if (enableLegacyGl) {
      const journalResult = await generateJournalEntry(
        tx,
        {
          id: tender.id,
          tenantId: ctx.tenantId,
          locationId: ctx.locationId!,
          orderId,
          tenderType: input.tenderType,
          amount: tenderAmount,
          tipAmount: input.tipAmount ?? 0,
        },
        {
          businessDate: input.businessDate,
          subtotal: order.subtotal,
          taxTotal: order.taxTotal,
          serviceChargeTotal: order.serviceChargeTotal,
          discountTotal: order.discountTotal,
          total: order.total,
          lines: orderLinesForGL,
        },
        isFullyPaid,
      );
      allocationSnapshot = journalResult.allocationSnapshot;

      // 8. Store allocation snapshot on tender
      await (tx as any)
        .update(tenders)
        .set({
          allocationSnapshot,
        })
        .where(eq(tenders.id, tender.id));
    }

    // 9. If fully paid, update order status
    if (isFullyPaid) {
      const now = new Date();
      await (tx as any)
        .update(orders)
        .set({
          status: 'paid',
          paidAt: now,
          updatedBy: ctx.user.id,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));
    }

    await incrementVersion(tx, orderId);
    await saveIdempotencyKey(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'recordTender',
      {
        tenderId: tender.id,
        changeGiven,
        isFullyPaid,
        remainingBalance: order.total - newTotalTendered,
        totalTendered: newTotalTendered,
      },
    );

    // 10. Build event
    const event = buildEventFromContext(ctx, 'tender.recorded.v1', {
      tenderId: tender.id,
      orderId,
      orderNumber: order.orderNumber,
      locationId: ctx.locationId,
      businessDate: input.businessDate,
      tenderType: input.tenderType,
      paymentMethod: input.tenderType,
      tenderSequence,
      amount: tenderAmount,
      tipAmount: input.tipAmount ?? 0,
      changeGiven,
      amountGiven: input.amountGiven,
      employeeId: input.employeeId,
      terminalId: input.terminalId,
      shiftId: input.shiftId ?? null,
      posMode: input.posMode ?? null,
      source: 'pos',
      orderTotal: order.total,
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      discountTotal: order.discountTotal,
      serviceChargeTotal: order.serviceChargeTotal,
      totalTendered: newTotalTendered,
      remainingBalance: order.total - newTotalTendered,
      isFullyPaid,
      customerId: order.customerId ?? null,
      billingAccountId: order.billingAccountId ?? null,
      surchargeAmountCents: input.surchargeAmountCents ?? 0,
      lines: enrichedLines,
      discountBreakdown: discountBreakdown.length > 0 ? discountBreakdown : undefined,
      priceOverrideLossCents: priceOverrideLossCents > 0 ? priceOverrideLossCents : undefined,
      metadata: input.metadata ?? null,
    });

    return {
      result: {
        tender: { ...tender, allocationSnapshot },
        changeGiven,
        isFullyPaid,
        remainingBalance: order.total - newTotalTendered,
        totalTendered: newTotalTendered,
      },
      events: [event],
    };
  });

  // Fire-and-forget — audit log should never block the POS response
  auditLog(ctx, 'tender.recorded', 'order', orderId).catch((e) => {
    console.error('Audit log failed for tender.recorded:', e instanceof Error ? e.message : e);
  });
  return result;
}
