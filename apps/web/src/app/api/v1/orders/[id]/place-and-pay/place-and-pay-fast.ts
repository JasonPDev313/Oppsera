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
  catalogModifierGroups,
} from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '@oppsera/core/helpers/optimistic-lock';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { generateJournalEntry } from '@oppsera/module-payments';
import type { PlaceOrderInput } from '@oppsera/module-orders';
import type { RecordTenderInput, OrderLineForGL } from '@oppsera/module-payments';

interface PlaceAndPayResult {
  tender: Record<string, unknown>;
  changeGiven: number;
  isFullyPaid: boolean;
  remainingBalance: number;
  totalTendered: number;
}

export async function placeAndRecordTender(
  ctx: RequestContext,
  orderId: string,
  placeInput: PlaceOrderInput,
  tenderInput: RecordTenderInput,
): Promise<PlaceAndPayResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }
  if (!tenderInput.clientRequestId) {
    throw new ValidationError('clientRequestId is required for tender operations');
  }

  // Pre-fetch accounting settings OUTSIDE the transaction (read-only, non-critical)
  let enableLegacyGl = true;
  try {
    const accountingApi = getAccountingPostingApi();
    const acctSettings = await accountingApi.getSettings(ctx.tenantId);
    enableLegacyGl = acctSettings.enableLegacyGlPosting ?? true;
  } catch {
    // AccountingPostingApi not initialized — legacy behavior
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // --- Combined idempotency check (use tender's clientRequestId as the canonical key) ---
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, tenderInput.clientRequestId, 'placeAndPay',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // --- Single fetchOrderForMutation (accepts 'open' OR 'placed') ---
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, ['open', 'placed']);
    const isAlreadyPlaced = order.status === 'placed';

    // ========== PLACE ORDER (skip if already placed) ==========
    let placedLines: any[];
    if (!isAlreadyPlaced) {
      // Fetch lines, charges, discounts in parallel
      const [lines, charges, discounts] = await Promise.all([
        (tx as any).select().from(orderLines).where(eq(orderLines.orderId, orderId)),
        (tx as any).select().from(orderCharges).where(eq(orderCharges.orderId, orderId)),
        (tx as any).select().from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId)),
      ]);

      if (lines.length === 0) {
        throw new ValidationError('Order must have at least one line item');
      }

      // Fetch line taxes (depends on lineIds)
      const lineIds = lines.map((l: any) => l.id);
      let lineTaxes: any[] = [];
      if (lineIds.length > 0) {
        lineTaxes = await (tx as any).select().from(orderLineTaxes)
          .where(inArray(orderLineTaxes.orderLineId, lineIds));
      }

      // Build receipt snapshot
      const receiptSnapshot = {
        lines: lines.map((l: any) => ({
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
            .filter((t: any) => t.orderLineId === l.id)
            .map((t: any) => ({ name: t.taxName, rate: Number(t.rateDecimal), amount: t.amount })),
        })),
        charges: charges.map((c: any) => ({ name: c.name, amount: c.amount })),
        discounts: discounts.map((d: any) => ({ type: d.type, amount: d.amount, reason: d.reason })),
        subtotal: order.subtotal,
        taxTotal: order.taxTotal,
        serviceChargeTotal: order.serviceChargeTotal,
        discountTotal: order.discountTotal,
        total: order.total,
      };

      const now = new Date();
      await (tx as any).update(orders).set({
        status: 'placed',
        placedAt: now,
        receiptSnapshot,
        updatedBy: ctx.user.id,
        updatedAt: now,
      }).where(eq(orders.id, orderId));

      placedLines = lines;
    } else {
      // Order already placed — just fetch lines for GL/event enrichment
      placedLines = await (tx as any).select().from(orderLines).where(eq(orderLines.orderId, orderId));
    }

    // ========== RECORD TENDER ==========
    // Fetch existing tenders + reversals in parallel
    const [existingTendersRows, existingReversals] = await Promise.all([
      (tx as any).select().from(tenders).where(
        and(eq(tenders.tenantId, ctx.tenantId), eq(tenders.orderId, orderId), eq(tenders.status, 'captured')),
      ),
      (tx as any).select().from(tenderReversals).where(
        and(eq(tenderReversals.tenantId, ctx.tenantId), eq(tenderReversals.orderId, orderId)),
      ),
    ]);

    const reversedIds = new Set((existingReversals as any[]).map((r: any) => r.originalTenderId));
    const activeTenders = (existingTendersRows as any[]).filter((t: any) => !reversedIds.has(t.id));
    const totalTendered = activeTenders.reduce((sum: number, t: any) => sum + (t.amount as number), 0);
    const remaining = order.total - totalTendered;

    if (remaining <= 0) {
      throw new ConflictError('Order is already fully paid');
    }

    const tenderSequence = activeTenders.length + 1;
    const tenderAmount = Math.min(tenderInput.amountGiven, remaining);
    const changeGiven = Math.max(0, tenderInput.amountGiven - remaining);
    const newTotalTendered = totalTendered + tenderAmount;
    const isFullyPaid = newTotalTendered >= order.total;

    // Insert tender row
    const [created] = await (tx as any).insert(tenders).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      orderId,
      tenderType: tenderInput.tenderType,
      tenderSequence,
      amount: tenderAmount,
      tipAmount: tenderInput.tipAmount ?? 0,
      changeGiven,
      amountGiven: tenderInput.amountGiven,
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
    const orderLinesForGL: OrderLineForGL[] = (placedLines as any[]).map((l: any) => ({
      departmentId: null,
      lineGross: l.lineTotal as number,
      lineTax: l.lineTax as number,
      lineNet: (l.lineTotal as number) - (l.lineTax as number),
    }));

    // Enriched lines for the tender event
    const enrichedLines = (placedLines as any[]).map((l: any) => ({
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

    // Legacy GL journal entry (gated)
    let allocationSnapshot: Record<string, unknown> | null = null;
    if (enableLegacyGl) {
      const journalResult = await generateJournalEntry(
        tx,
        {
          id: tender.id,
          tenantId: ctx.tenantId,
          locationId: ctx.locationId!,
          orderId,
          tenderType: tenderInput.tenderType,
          amount: tenderAmount,
          tipAmount: tenderInput.tipAmount ?? 0,
        },
        {
          businessDate: tenderInput.businessDate,
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

      await (tx as any).update(tenders).set({ allocationSnapshot }).where(eq(tenders.id, tender.id));
    }

    // If fully paid, update order status
    if (isFullyPaid) {
      const now = new Date();
      await (tx as any).update(orders).set({
        status: 'paid',
        paidAt: now,
        updatedBy: ctx.user.id,
        updatedAt: now,
      }).where(eq(orders.id, orderId));
    }

    // Single incrementVersion (covers both place + tender version bump)
    await incrementVersion(tx, orderId);

    await saveIdempotencyKey(tx, ctx.tenantId, tenderInput.clientRequestId, 'placeAndPay', {
      tenderId: tender.id,
      changeGiven,
      isFullyPaid,
      remainingBalance: order.total - newTotalTendered,
      totalTendered: newTotalTendered,
    });

    // ========== BUILD EVENTS ==========
    // Resolve category names + modifier groups in parallel (for order.placed event enrichment)
    const subDeptIds = [...new Set(placedLines.map((l: any) => l.subDepartmentId).filter(Boolean))] as string[];
    const catalogItemIds = [...new Set(placedLines.map((l: any) => l.catalogItemId).filter(Boolean))] as string[];
    const categoryNameMap = new Map<string, string>();
    let assignedGroupsMap = new Map<string, string[]>();
    const modGroupMetaMap = new Map<string, { name: string; isRequired: boolean }>();

    await Promise.all([
      subDeptIds.length > 0
        ? (tx as any).select({ id: catalogCategories.id, name: catalogCategories.name })
            .from(catalogCategories).where(inArray(catalogCategories.id, subDeptIds))
            .then((cats: any[]) => { for (const c of cats) categoryNameMap.set(c.id, c.name); })
        : Promise.resolve(),
      catalogItemIds.length > 0
        ? (async () => {
            try {
              const catalogApi = getCatalogReadApi();
              assignedGroupsMap = await catalogApi.getAssignedModifierGroupIds(ctx.tenantId, catalogItemIds);
              const allGroupIds = [...new Set(Array.from(assignedGroupsMap.values()).flat())];
              if (allGroupIds.length > 0) {
                const groups = await (tx as any).select({
                  id: catalogModifierGroups.id,
                  name: catalogModifierGroups.name,
                  isRequired: catalogModifierGroups.isRequired,
                }).from(catalogModifierGroups).where(inArray(catalogModifierGroups.id, allGroupIds));
                for (const g of groups) modGroupMetaMap.set(g.id, { name: g.name, isRequired: g.isRequired });
              }
            } catch { /* best-effort */ }
          })()
        : Promise.resolve(),
    ]);

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
        total: order.total,
        lineCount: placedLines.length,
        customerId: order.customerId ?? null,
        billingAccountId: order.billingAccountId ?? null,
        lines: placedLines.map((l: any) => ({
          catalogItemId: l.catalogItemId,
          catalogItemName: l.catalogItemName ?? 'Unknown',
          categoryName: l.subDepartmentId ? (categoryNameMap.get(l.subDepartmentId) ?? null) : null,
          qty: Number(l.qty),
          unitPrice: l.unitPrice ?? 0,
          lineSubtotal: l.lineSubtotal ?? 0,
          lineTax: l.lineTax ?? 0,
          lineTotal: l.lineTotal ?? 0,
          packageComponents: l.packageComponents ?? null,
          modifiers: (l.modifiers ?? []).map((m: any) => ({
            modifierId: m.modifierId,
            modifierGroupId: m.modifierGroupId ?? null,
            name: m.name,
            priceAdjustmentCents: m.priceAdjustment ?? 0,
            instruction: m.instruction ?? null,
            isDefault: m.isDefault ?? false,
          })),
          assignedModifierGroupIds: (assignedGroupsMap.get(l.catalogItemId) ?? []).map((gId: string) => ({
            modifierGroupId: gId,
            groupName: modGroupMetaMap.get(gId)?.name ?? null,
            isRequired: modGroupMetaMap.get(gId)?.isRequired ?? false,
          })),
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
        tender: { ...tender, allocationSnapshot },
        changeGiven,
        isFullyPaid,
        remainingBalance: order.total - newTotalTendered,
        totalTendered: newTotalTendered,
      } as PlaceAndPayResult,
      events,
    };
  });

  // Fire-and-forget audit logs
  auditLog(ctx, 'order.placed', 'order', orderId).catch(() => {});
  auditLog(ctx, 'tender.recorded', 'order', orderId).catch(() => {});

  return result;
}
