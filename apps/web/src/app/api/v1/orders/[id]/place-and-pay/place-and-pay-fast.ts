/**
 * Combined placeOrder + recordTender in a SINGLE transaction.
 *
 * Eliminates ~8 redundant DB round-trips vs calling them separately:
 * - 1x set_config instead of 2x
 * - 1x fetchOrderForMutation instead of 2x
 * - 1x order_lines fetch instead of 2x
 * - 1x incrementVersion instead of 2x
 * - 1x idempotency check/save pair instead of 2x
 *
 * This is orchestration-layer code — it imports from both orders and payments modules,
 * which is allowed in the web app (the only place that imports multiple modules).
 */
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError, ConflictError } from '@oppsera/shared';
import {
  orders,
  orderLines,
  orderCharges,
  orderDiscounts,
  orderLineTaxes,
  tenders,
  tenderReversals,
  catalogCategories,
} from '@oppsera/db';
import type { InferSelectModel } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '@oppsera/core/helpers/optimistic-lock';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { generateJournalEntry } from '@oppsera/module-payments';
import type { PlaceOrderInput } from '@oppsera/module-orders';
import type { RecordTenderInput, OrderLineForGL } from '@oppsera/module-payments';

type OrderLine = InferSelectModel<typeof orderLines>;
type OrderCharge = InferSelectModel<typeof orderCharges>;
type OrderDiscount = InferSelectModel<typeof orderDiscounts>;
type OrderLineTax = InferSelectModel<typeof orderLineTaxes>;
type Tender = InferSelectModel<typeof tenders>;
type TenderReversal = InferSelectModel<typeof tenderReversals>;

export interface PlaceAndPayResult {
  tender: Record<string, unknown>;
  changeGiven: number;
  isFullyPaid: boolean;
  remainingBalance: number;
  totalTendered: number;
}

export interface PlaceAndPayFullResult {
  data: PlaceAndPayResult;
  /** Schedule with next/server after() — runs GL + audit logs after response is sent */
  runDeferredWork: () => Promise<void>;
}

export async function placeAndRecordTender(
  ctx: RequestContext,
  orderId: string,
  placeInput: PlaceOrderInput,
  tenderInput: RecordTenderInput,
  options?: { payExact?: boolean },
): Promise<PlaceAndPayFullResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'Location is required', 400);
  }
  if (!tenderInput.clientRequestId) {
    throw new ValidationError('clientRequestId is required for tender operations');
  }
  if (tenderInput.amountGiven <= 0) {
    throw new ValidationError('amountGiven must be at least 1 cent');
  }

  // Closure variable for post-transaction legacy GL (resolved in deferred work)
  let legacyGlData: {
    tenderId: string; tenantId: string; locationId: string; orderId: string;
    tenderType: string; tenderAmount: number; tipAmount: number;
    businessDate: string; subtotal: number; taxTotal: number;
    serviceChargeTotal: number; discountTotal: number; total: number;
    orderLinesForGL: OrderLineForGL[]; isFullyPaid: boolean;
  } | null = null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // --- Combined idempotency check (use tender's clientRequestId as the canonical key) ---
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, tenderInput.clientRequestId, 'placeAndPay',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // --- Single fetchOrderForMutation (accepts 'open' OR 'placed') ---
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, ['open', 'placed']);
    const isAlreadyPlaced = order.status === 'placed';

    // ========== PLACE ORDER (skip if already placed) ==========
    let placedLines: OrderLine[];
    if (!isAlreadyPlaced) {
      // Fetch lines, charges, discounts in parallel
      const [lines, charges, discounts] = await Promise.all([
        tx.select().from(orderLines).where(eq(orderLines.orderId, orderId)),
        tx.select().from(orderCharges).where(eq(orderCharges.orderId, orderId)),
        tx.select().from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId)),
      ]);

      if (lines.length === 0) {
        throw new ValidationError('Order must have at least one line item');
      }

      // Fetch line taxes (depends on lineIds)
      const lineIds = lines.map((l) => l.id);
      let lineTaxes: OrderLineTax[] = [];
      if (lineIds.length > 0) {
        lineTaxes = await tx.select().from(orderLineTaxes)
          .where(inArray(orderLineTaxes.orderLineId, lineIds));
      }

      // Build receipt snapshot
      const receiptSnapshot = {
        lines: lines.map((l) => ({
          id: l.id,
          name: l.catalogItemName,
          sku: l.catalogItemSku,
          qty: Number(l.qty),
          unitPrice: l.unitPrice,
          lineSubtotal: l.lineSubtotal,
          lineTax: l.lineTax,
          lineTotal: l.lineTotal,
          modifiers: l.modifiers,
          taxes: lineTaxes
            .filter((t) => t.orderLineId === l.id)
            .map((t) => ({ name: t.taxName, rate: Number(t.rateDecimal), amount: t.amount })),
        })),
        charges: (charges as OrderCharge[]).map((c) => ({ name: c.name, amount: c.amount })),
        discounts: (discounts as OrderDiscount[]).map((d) => ({ type: d.type, amount: d.amount, reason: d.reason })),
        subtotal: order.subtotal,
        taxTotal: order.taxTotal,
        serviceChargeTotal: order.serviceChargeTotal,
        discountTotal: order.discountTotal,
        total: order.total,
      };

      const now = new Date();
      await tx.update(orders).set({
        status: 'placed',
        placedAt: now,
        receiptSnapshot,
        updatedBy: ctx.user.id,
        updatedAt: now,
      }).where(eq(orders.id, orderId));

      placedLines = lines;
    } else {
      // Order already placed — just fetch lines for GL/event enrichment
      placedLines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    }

    // ========== RECORD TENDER ==========
    // Fetch existing tenders + reversals in parallel
    const [existingTendersRows, existingReversals] = await Promise.all([
      tx.select().from(tenders).where(
        and(eq(tenders.tenantId, ctx.tenantId), eq(tenders.orderId, orderId), eq(tenders.status, 'captured')),
      ),
      tx.select().from(tenderReversals).where(
        and(eq(tenderReversals.tenantId, ctx.tenantId), eq(tenderReversals.orderId, orderId)),
      ),
    ]);

    const reversedIds = new Set(existingReversals.map((r: TenderReversal) => r.originalTenderId));
    const activeTenders = existingTendersRows.filter((t: Tender) => !reversedIds.has(t.id));
    const totalTendered = activeTenders.reduce((sum: number, t: Tender) => sum + t.amount, 0);
    const remaining = order.total - totalTendered;

    // Defense-in-depth: reject if order is already fully paid.
    // fetchOrderForMutation's FOR UPDATE lock serializes concurrent requests,
    // so after the lock releases the second caller sees the updated state.
    if (remaining <= 0) {
      throw new ConflictError('Order is already fully paid');
    }

    const tenderSequence = activeTenders.length + 1;
    // payExact: use the server-side remaining balance as the effective amount,
    // so stale client-side totals (pre-tax) can never cause a partial payment.
    const effectiveAmountGiven = options?.payExact ? remaining : tenderInput.amountGiven;
    const tenderAmount = Math.min(effectiveAmountGiven, remaining);
    const changeGiven = Math.max(0, effectiveAmountGiven - remaining);
    const newTotalTendered = totalTendered + tenderAmount;
    const isFullyPaid = newTotalTendered >= order.total;

    // Insert tender row
    const [created] = await tx.insert(tenders).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!, // validated non-null at function entry
      orderId,
      tenderType: tenderInput.tenderType,
      tenderSequence,
      amount: tenderAmount,
      tipAmount: tenderInput.tipAmount ?? 0,
      changeGiven,
      amountGiven: effectiveAmountGiven,
      currency: 'USD',
      status: 'captured',
      businessDate: tenderInput.businessDate,
      shiftId: tenderInput.shiftId ?? null,
      posMode: tenderInput.posMode ?? null,
      source: 'pos',
      employeeId: tenderInput.employeeId,
      terminalId: tenderInput.terminalId,
      metadata: tenderInput.metadata ?? null,
      surchargeAmountCents: tenderInput.surchargeAmountCents ?? 0,
      createdBy: ctx.user.id,
    }).returning();
    const tender = created!;

    // Build GL lines from already-fetched order lines (no duplicate fetch!)
    const orderLinesForGL: OrderLineForGL[] = placedLines.map((l) => ({
      departmentId: null,
      lineGross: l.lineTotal,
      lineTax: l.lineTax,
      lineNet: l.lineTotal - l.lineTax,
    }));

    // Enriched lines for the tender event
    const enrichedLines = placedLines.map((l) => ({
      catalogItemId: l.catalogItemId,
      catalogItemName: l.catalogItemName,
      subDepartmentId: l.subDepartmentId ?? null,
      qty: Number(l.qty),
      extendedPriceCents: l.lineSubtotal,
      taxGroupId: l.taxGroupId ?? null,
      taxAmountCents: l.lineTax,
      costCents: l.costPrice ?? null,
      packageComponents: l.packageComponents ?? null,
    }));

    // Capture data for post-transaction GL (runs in deferred work after response).
    legacyGlData = {
      tenderId: tender.id,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      orderId,
      tenderType: tenderInput.tenderType,
      tenderAmount,
      tipAmount: tenderInput.tipAmount ?? 0,
      businessDate: tenderInput.businessDate,
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      serviceChargeTotal: order.serviceChargeTotal,
      discountTotal: order.discountTotal,
      total: order.total,
      orderLinesForGL,
      isFullyPaid,
    };

    // If fully paid, update order status
    if (isFullyPaid) {
      const now = new Date();
      await tx.update(orders).set({
        status: 'paid',
        paidAt: now,
        updatedBy: ctx.user.id,
        updatedAt: now,
      }).where(eq(orders.id, orderId));
    }

    // Single incrementVersion (covers both place + tender version bump)
    await incrementVersion(tx, orderId, ctx.tenantId);

    await saveIdempotencyKey(tx, ctx.tenantId, tenderInput.clientRequestId, 'placeAndPay', {
      tenderId: tender.id,
      changeGiven,
      isFullyPaid,
      remainingBalance: order.total - newTotalTendered,
      totalTendered: newTotalTendered,
    });

    // ========== BUILD EVENTS ==========
    // Resolve category names from subDepartmentId for reporting/AI chat enrichment
    const subDeptIds = [...new Set(placedLines.map((l) => l.subDepartmentId).filter(Boolean))] as string[];
    const categoryNameMap = new Map<string, string>();
    if (subDeptIds.length > 0) {
      const cats = await tx.select({ id: catalogCategories.id, name: catalogCategories.name })
        .from(catalogCategories)
        .where(inArray(catalogCategories.id, subDeptIds));
      for (const c of cats) categoryNameMap.set(c.id, c.name);
    }

    const events = [];

    // order.placed event (only if we actually placed it)
    if (!isAlreadyPlaced) {
      events.push(buildEventFromContext(ctx, 'order.placed.v1', {
        orderId,
        orderNumber: order.orderNumber,
        locationId: order.locationId,
        businessDate: order.businessDate,
        subtotal: order.subtotal,
        taxTotal: order.taxTotal,
        discountTotal: order.discountTotal ?? 0,
        serviceChargeTotal: order.serviceChargeTotal ?? 0,
        total: order.total,
        lineCount: placedLines.length,
        customerId: order.customerId ?? null,
        customerName: null,
        billingAccountId: order.billingAccountId ?? null,
        tabName: (order.metadata as Record<string, unknown> | null)?.tabName ?? null,
        tableNumber: (order.metadata as Record<string, unknown> | null)?.tableNumber ?? null,
        employeeId: ctx.user.id,
        employeeName: ctx.user.name ?? ctx.user.email ?? null,
        lines: placedLines.map((l) => ({
          catalogItemId: l.catalogItemId,
          catalogItemName: l.catalogItemName ?? 'Unknown',
          categoryName: l.subDepartmentId ? (categoryNameMap.get(l.subDepartmentId) ?? null) : null,
          qty: Number(l.qty),
          unitPrice: l.unitPrice ?? 0,
          lineSubtotal: l.lineSubtotal ?? 0,
          lineTax: l.lineTax ?? 0,
          lineTotal: l.lineTotal ?? 0,
          packageComponents: l.packageComponents ?? null,
          modifiers: ((l.modifiers ?? []) as Array<{
            modifierId: string;
            modifierGroupId?: string;
            name: string;
            priceAdjustment?: number;
            instruction?: string;
            isDefault?: boolean;
          }>).map((m) => ({
            modifierId: m.modifierId,
            modifierGroupId: m.modifierGroupId ?? null,
            name: m.name,
            priceAdjustmentCents: m.priceAdjustment ?? 0,
            instruction: m.instruction ?? null,
            isDefault: m.isDefault ?? false,
          })),
          assignedModifierGroupIds: [],
        })),
      }));
    }

    // tender.recorded event (always)
    events.push(buildEventFromContext(ctx, 'tender.recorded.v1', {
      tenderId: tender.id,
      orderId,
      orderNumber: order.orderNumber,
      locationId: ctx.locationId,
      businessDate: tenderInput.businessDate,
      tenderType: tenderInput.tenderType,
      paymentMethod: tenderInput.tenderType,
      tenderSequence,
      amount: tenderAmount,
      tipAmount: tenderInput.tipAmount ?? 0,
      changeGiven,
      amountGiven: tenderInput.amountGiven,
      employeeId: tenderInput.employeeId,
      terminalId: tenderInput.terminalId,
      shiftId: tenderInput.shiftId ?? null,
      posMode: tenderInput.posMode ?? null,
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
      surchargeAmountCents: tenderInput.surchargeAmountCents ?? 0,
      lines: enrichedLines,
    }));

    return {
      result: {
        tender,
        changeGiven,
        isFullyPaid,
        remainingBalance: order.total - newTotalTendered,
        totalTendered: newTotalTendered,
      } as PlaceAndPayResult,
      events,
    };
  });

  // Deferred work: GL + audit logs run AFTER the response via next/server after().
  // Vercel keeps the function alive until after() callbacks complete (§205).
  const runDeferredWork = async () => {
    // Check accounting settings inside deferred work (not on the hot path)
    let enableLegacyGl = true;
    try {
      const accountingApi = getAccountingPostingApi();
      const acctSettings = await accountingApi.getSettings(ctx.tenantId);
      enableLegacyGl = acctSettings.enableLegacyGlPosting ?? true;
    } catch {
      // AccountingPostingApi not initialized — legacy behavior
    }

    await Promise.all([
      // Legacy GL journal entry
      legacyGlData && enableLegacyGl
        ? withTenant(ctx.tenantId, async (glTx) => {
            const journalResult = await generateJournalEntry(
              glTx,
              {
                id: legacyGlData!.tenderId,
                tenantId: legacyGlData!.tenantId,
                locationId: legacyGlData!.locationId,
                orderId: legacyGlData!.orderId,
                tenderType: legacyGlData!.tenderType,
                amount: legacyGlData!.tenderAmount,
                tipAmount: legacyGlData!.tipAmount,
              },
              {
                businessDate: legacyGlData!.businessDate,
                subtotal: legacyGlData!.subtotal,
                taxTotal: legacyGlData!.taxTotal,
                serviceChargeTotal: legacyGlData!.serviceChargeTotal,
                discountTotal: legacyGlData!.discountTotal,
                total: legacyGlData!.total,
                lines: legacyGlData!.orderLinesForGL,
              },
              legacyGlData!.isFullyPaid,
            );
            await glTx.update(tenders).set({
              allocationSnapshot: journalResult.allocationSnapshot,
            }).where(eq(tenders.id, legacyGlData!.tenderId));
          }).catch((err) => {
            console.error(`Legacy GL failed for tender in order ${orderId}:`, err instanceof Error ? err.message : err);
          })
        : Promise.resolve(),
      // Audit logs (non-fatal)
      auditLog(ctx, 'order.placed', 'order', orderId)
        .catch((e) => { console.error('Audit log failed for order.placed:', e instanceof Error ? e.message : e); }),
      auditLog(ctx, 'tender.recorded', 'order', orderId)
        .catch((e) => { console.error('Audit log failed for tender.recorded:', e instanceof Error ? e.message : e); }),
    ]);
  };

  return { data: result, runDeferredWork };
}
