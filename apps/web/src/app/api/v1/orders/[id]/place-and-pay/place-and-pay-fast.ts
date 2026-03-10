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
  customers,
  arTransactions,
} from '@oppsera/db';
import type { InferSelectModel } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
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
      }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

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

    // ── House account: create AR transaction + update balance ──
    // Uses SELECT ... FOR UPDATE on billing_accounts to serialize concurrent
    // charges to the same account (prevents double-charge race conditions).
    if (tenderInput.tenderType === 'house_account' && tenderInput.metadata?.billingAccountId) {
      const billingAccountId = tenderInput.metadata.billingAccountId as string;
      const houseCustomerId = (tenderInput.metadata.customerId as string) ?? null;
      const chargeTotal = tenderAmount + (tenderInput.tipAmount ?? 0);

      // Lock the billing account row — serializes concurrent charges
      const lockedRows = await tx.execute(
        sql`SELECT id, status, current_balance_cents, credit_limit_cents
            FROM billing_accounts
            WHERE id = ${billingAccountId}
              AND tenant_id = ${ctx.tenantId}
            FOR UPDATE`,
      );
      const lockedAccount = Array.from(lockedRows as Iterable<Record<string, unknown>>)[0];
      if (!lockedAccount) {
        throw new AppError('BILLING_ACCOUNT_NOT_FOUND', 'Billing account not found', 404);
      }
      if (lockedAccount.status !== 'active') {
        throw new AppError('BILLING_ACCOUNT_INACTIVE', 'Billing account is not active', 403);
      }

      // Insert AR transaction (charge)
      await tx.insert(arTransactions).values({
        tenantId: ctx.tenantId,
        billingAccountId,
        type: 'charge',
        amountCents: chargeTotal,
        dueDate: tenderInput.businessDate,
        referenceType: 'tender',
        referenceId: tender.id,
        customerId: houseCustomerId,
        notes: `POS house account charge — Order ${orderId}`,
        sourceModule: 'pos',
        businessDate: tenderInput.businessDate,
        locationId: ctx.locationId!,
        status: 'posted',
        postedAt: new Date(),
        createdBy: ctx.user.id,
        metaJson: {
          orderId,
          tenderId: tender.id,
          tenderSequence,
          hasSignature: !!tenderInput.metadata.hasSignature,
        },
      });

      // Update billing account balance (row already locked by FOR UPDATE above)
      await tx.execute(
        sql`UPDATE billing_accounts
            SET current_balance_cents = current_balance_cents + ${chargeTotal},
                updated_at = NOW()
            WHERE id = ${billingAccountId}
              AND tenant_id = ${ctx.tenantId}`,
      );
    }

    // Build GL lines from already-fetched order lines (no duplicate fetch!)
    const orderLinesForGL: OrderLineForGL[] = placedLines.map((l) => ({
      departmentId: l.subDepartmentId ?? null,
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
      }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));
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

    // ========== ENRICH FOR EVENTS ==========
    // Price override loss: compute from already-fetched placedLines (no extra query)
    const priceOverrideLossCents = placedLines.reduce(
      (sum, l) => sum + (l.priceOverrideDiscountCents ?? 0), 0,
    );

    // Resolve category names from subDepartmentId for reporting/AI chat enrichment
    const subDeptIds = [...new Set(placedLines.map((l) => l.subDepartmentId).filter(Boolean))] as string[];
    const catalogItemIds = [...new Set(placedLines.map((l) => l.catalogItemId).filter(Boolean))] as string[];
    const categoryNameMap = new Map<string, string>();
    let assignedGroupsMap = new Map<string, string[]>();
    const modGroupMetaMap = new Map<string, { name: string; isRequired: boolean }>();
    let resolvedCustomerName: string | null = null;
    // Discount breakdown by classification — runs in parallel with other enrichments
    const discountBreakdownMap = new Map<string, number>();

    // Run ALL enrichment reads concurrently — discount breakdown now parallelized
    // with category/modifier/customer lookups instead of running sequentially before them.
    await Promise.all([
      // Discount breakdown (was sequential, now parallel)
      tx.select({
        classification: orderDiscounts.discountClassification,
        amount: orderDiscounts.amount,
      })
        .from(orderDiscounts)
        .where(and(eq(orderDiscounts.orderId, orderId), eq(orderDiscounts.tenantId, ctx.tenantId)))
        .then((rows) => {
          for (const row of rows) {
            const key = row.classification ?? 'manual_discount';
            discountBreakdownMap.set(key, (discountBreakdownMap.get(key) ?? 0) + row.amount);
          }
        }),
      // Category names
      subDeptIds.length > 0
        ? tx.select({ id: catalogCategories.id, name: catalogCategories.name })
            .from(catalogCategories)
            .where(inArray(catalogCategories.id, subDeptIds))
            .then((cats) => { for (const c of cats) categoryNameMap.set(c.id, c.name); })
        : Promise.resolve(),
      // Modifier groups
      catalogItemIds.length > 0 && !isAlreadyPlaced
        ? (async () => {
            try {
              const catalogApi = getCatalogReadApi();
              assignedGroupsMap = await catalogApi.getAssignedModifierGroupIds(ctx.tenantId, catalogItemIds);
              const allGroupIds = [...new Set(Array.from(assignedGroupsMap.values()).flat())];
              if (allGroupIds.length > 0) {
                const groups = await tx.select({
                  id: catalogModifierGroups.id,
                  name: catalogModifierGroups.name,
                  isRequired: catalogModifierGroups.isRequired,
                }).from(catalogModifierGroups).where(inArray(catalogModifierGroups.id, allGroupIds));
                for (const g of groups) modGroupMetaMap.set(g.id, { name: g.name, isRequired: g.isRequired });
              }
            } catch {
              // Best-effort — modifier reporting should never block order placement
            }
          })()
        : Promise.resolve(),
      // Customer name
      order.customerId && !isAlreadyPlaced
        ? tx.select({ displayName: customers.displayName })
            .from(customers)
            .where(eq(customers.id, order.customerId))
            .then((rows) => { if (rows[0]) resolvedCustomerName = rows[0].displayName; })
        : Promise.resolve(),
    ]);

    const discountBreakdown = Array.from(discountBreakdownMap.entries()).map(
      ([classification, amountCents]) => ({ classification, amountCents }),
    );

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
        customerName: resolvedCustomerName,
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
      amountGiven: effectiveAmountGiven,
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
      discountBreakdown: discountBreakdown.length > 0 ? discountBreakdown : undefined,
      priceOverrideLossCents: priceOverrideLossCents > 0 ? priceOverrideLossCents : undefined,
      metadata: tenderInput.metadata ?? null,
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
            }).where(and(eq(tenders.id, legacyGlData!.tenderId), eq(tenders.tenantId, legacyGlData!.tenantId)));
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
