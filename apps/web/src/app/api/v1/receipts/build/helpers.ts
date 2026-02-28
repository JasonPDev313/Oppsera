/**
 * Receipt Build API — Data Fetching Helpers
 *
 * Lightweight queries to fetch order + tenders for receipt generation.
 * These mirror the shapes expected by the receipt engine adapters.
 */

import { withTenant } from '@oppsera/db';
import { orders, orderLines, orderCharges, orderDiscounts, tenders } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';

export async function getOrder(tenantId: string, orderId: string) {
  return withTenant(tenantId, async (tx) => {
    const orderRows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: orders.createdAt,
        status: orders.status,
        terminalId: orders.terminalId,
        subtotal: orders.subtotal,
        discountTotal: orders.discountTotal,
        serviceChargeTotal: orders.serviceChargeTotal,
        taxTotal: orders.taxTotal,
        total: orders.total,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      .limit(1);

    const items = Array.from(orderRows as Iterable<typeof orderRows[number]>);
    if (items.length === 0) return null;
    const order = items[0]!;

    // Fetch lines, charges, discounts in parallel
    const [lineRows, chargeRows, discountRows] = await Promise.all([
      tx
        .select({
          id: orderLines.id,
          catalogItemName: orderLines.catalogItemName,
          qty: orderLines.qty,
          unitPrice: orderLines.unitPrice,
          lineTotal: orderLines.lineTotal,
          sortOrder: orderLines.sortOrder,
          specialInstructions: orderLines.specialInstructions,
        })
        .from(orderLines)
        .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId))),
      tx
        .select({
          name: orderCharges.name,
          calculationType: orderCharges.calculationType,
          value: orderCharges.value,
          amount: orderCharges.amount,
        })
        .from(orderCharges)
        .where(and(eq(orderCharges.tenantId, tenantId), eq(orderCharges.orderId, orderId))),
      tx
        .select({
          type: orderDiscounts.type,
          value: orderDiscounts.value,
          amount: orderDiscounts.amount,
        })
        .from(orderDiscounts)
        .where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId))),
    ]);

    return {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt?.toISOString() ?? new Date().toISOString(),
      status: order.status,
      terminalId: order.terminalId,
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      serviceChargeTotal: Number(order.serviceChargeTotal),
      taxTotal: Number(order.taxTotal),
      total: Number(order.total),
      lines: Array.from(lineRows as Iterable<typeof lineRows[number]>).map((l) => ({
        id: l.id,
        catalogItemName: l.catalogItemName ?? 'Item',
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
        sortOrder: Number(l.sortOrder ?? 0),
        specialInstructions: l.specialInstructions,
      })),
      charges: Array.from(chargeRows as Iterable<typeof chargeRows[number]>).map((c) => ({
        name: c.name ?? 'Charge',
        calculationType: c.calculationType ?? 'fixed',
        value: Number(c.value),
        amount: Number(c.amount),
      })),
      discounts: Array.from(discountRows as Iterable<typeof discountRows[number]>).map((d) => ({
        type: d.type ?? 'fixed',
        value: Number(d.value),
        amount: Number(d.amount),
      })),
    };
  });
}

export async function getOrderTenders(tenantId: string, orderId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        tenderType: tenders.tenderType,
        amount: tenders.amount,
        tipAmount: tenders.tipAmount,
        changeGiven: tenders.changeGiven,
        cardLast4: tenders.cardLast4,
        cardBrand: tenders.cardBrand,
        surchargeAmountCents: tenders.surchargeAmountCents,
      })
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, tenantId),
          eq(tenders.orderId, orderId),
          sql`NOT EXISTS (
            SELECT 1 FROM tender_reversals tr
            WHERE tr.tender_id = ${tenders.id}
          )`,
        ),
      );

    return Array.from(rows as Iterable<typeof rows[number]>).map((t) => ({
      tenderType: t.tenderType,
      amount: Number(t.amount),
      tipAmount: Number(t.tipAmount),
      changeGiven: Number(t.changeGiven),
      isReversed: false,
      cardLast4: t.cardLast4 ?? null,
      cardBrand: t.cardBrand ?? null,
      authCode: null,
      surchargeAmountCents: Number(t.surchargeAmountCents ?? 0),
    }));
  });
}
