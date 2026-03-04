import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes, catalogCategories, catalogModifierGroups, customers } from '@oppsera/db';
import { eq, inArray } from 'drizzle-orm';
import { getCatalogReadApi } from '@oppsera/core/helpers/catalog-read-api';
import type { PlaceOrderInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function placeOrder(ctx: RequestContext, orderId: string, input: PlaceOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'placeOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as unknown, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Fetch lines, charges, discounts in parallel (independent reads)
    const [lines, charges, discounts] = await Promise.all([
      tx.select().from(orderLines).where(eq(orderLines.orderId, orderId)),
      tx.select().from(orderCharges).where(eq(orderCharges.orderId, orderId)),
      tx.select().from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId)),
    ]);

    if (lines.length === 0) {
      throw new ValidationError('Order must have at least one line item');
    }

    const lineIds = lines.map((l) => l.id);
    let lineTaxes: (typeof orderLineTaxes.$inferSelect)[] = [];
    if (lineIds.length > 0) {
      lineTaxes = await tx.select().from(orderLineTaxes)
        .where(inArray(orderLineTaxes.orderLineId, lineIds));
    }

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
      charges: charges.map((c) => ({
        name: c.name,
        amount: c.amount,
      })),
      discounts: discounts.map((d) => ({
        type: d.type,
        amount: d.amount,
        reason: d.reason,
      })),
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

    await incrementVersion(tx, orderId, ctx.tenantId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'placeOrder', { orderId });

    // Resolve category names + modifier groups in parallel (both are independent reporting enrichments)
    const subDeptIds = [...new Set(lines.map((l) => l.subDepartmentId).filter(Boolean))] as string[];
    const catalogItemIds = [...new Set(lines.map((l) => l.catalogItemId).filter(Boolean))] as string[];
    const categoryNameMap = new Map<string, string>();
    let assignedGroupsMap = new Map<string, string[]>();
    const modGroupMetaMap = new Map<string, { name: string; isRequired: boolean }>();

    // Resolve customer name if customerId is set (for event payload enrichment)
    let resolvedCustomerName: string | null = null;

    // Run all enrichments concurrently
    const [_catResult, _modResult, _custResult] = await Promise.all([
      // Read-through: denormalized from catalogCategories table (owned by catalog module).
      // Orders module reads category names here solely to enrich the order.placed event payload
      // for downstream read models (sales history, reporting). No catalog data is mutated.
      subDeptIds.length > 0
        ? tx.select({ id: catalogCategories.id, name: catalogCategories.name })
            .from(catalogCategories)
            .where(inArray(catalogCategories.id, subDeptIds))
            .then((cats) => { for (const c of cats) categoryNameMap.set(c.id, c.name); })
        : Promise.resolve(),
      // Read-through: denormalized from catalogModifierGroups table (owned by catalog module).
      // Modifier group metadata is fetched here for reporting enrichment in the event payload only.
      // The catalog read API is used as an abstraction layer; no catalog data is mutated.
      catalogItemIds.length > 0
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
      // Read-through: denormalized from customers table (owned by customers module).
      // Customer display name is fetched here to enrich the order.placed event payload so that
      // downstream consumers (e.g. sales history, CRM read models) receive a denormalized name
      // without needing a secondary lookup. No customer data is mutated.
      order.customerId
        ? tx.select({ displayName: customers.displayName })
            .from(customers)
            .where(eq(customers.id, order.customerId))
            .then((rows) => { if (rows[0]) resolvedCustomerName = rows[0].displayName; })
        : Promise.resolve(),
    ]);

    const event = buildEventFromContext(ctx, 'order.placed.v1', {
      orderId,
      orderNumber: order.orderNumber,
      locationId: order.locationId,
      businessDate: order.businessDate,
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      discountTotal: order.discountTotal ?? 0,
      serviceChargeTotal: order.serviceChargeTotal ?? 0,
      total: order.total,
      lineCount: lines.length,
      customerId: order.customerId ?? null,
      customerName: resolvedCustomerName,
      billingAccountId: order.billingAccountId ?? null,
      // Sales History enrichment: F&B detection + employee
      tabName: (order.metadata as Record<string, unknown> | null)?.tabName ?? null,
      tableNumber: (order.metadata as Record<string, unknown> | null)?.tableNumber ?? null,
      employeeId: ctx.user.id,
      employeeName: ctx.user.name ?? ctx.user.email ?? null,
      lines: lines.map((l) => ({
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
          modifierGroupId?: string | null;
          name: string;
          priceAdjustment?: number;
          instruction?: string | null;
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
    });

    return { result: { ...order, status: 'placed', placedAt: now, receiptSnapshot, version: order.version + 1 }, events: [event] };
  });

  // Fire-and-forget — audit log should never block the POS response
  auditLog(ctx, 'order.placed', 'order', orderId).catch((e) => {
    console.error('Audit log failed for order.placed:', e instanceof Error ? e.message : e);
  });
  return result;
}
