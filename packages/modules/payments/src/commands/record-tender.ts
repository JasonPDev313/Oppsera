import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError, ConflictError } from '@oppsera/shared';
import { tenders, tenderReversals, orderLines, orders } from '@oppsera/db';
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

    // 3. Calculate remaining balance
    const existingTendersRows = await (tx as any)
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, ctx.tenantId),
          eq(tenders.orderId, orderId),
          eq(tenders.status, 'captured'),
        ),
      );

    // Filter out reversed tenders
    const existingReversals = await (tx as any)
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, ctx.tenantId),
          eq(tenderReversals.orderId, orderId),
        ),
      );
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

    // 7. Generate GL journal entry
    const { allocationSnapshot } = await generateJournalEntry(
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

    // 8. Store allocation snapshot on tender
    await (tx as any)
      .update(tenders)
      .set({
        allocationSnapshot,
      })
      .where(eq(tenders.id, tender.id));

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
      totalTendered: newTotalTendered,
      remainingBalance: order.total - newTotalTendered,
      isFullyPaid,
      customerId: order.customerId ?? null,
      lines: enrichedLines,
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

  await auditLog(ctx, 'tender.recorded', 'order', orderId);
  return result;
}
