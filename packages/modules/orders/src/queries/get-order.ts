import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface OrderDetail {
  id: string;
  tenantId: string;
  locationId: string;
  orderNumber: string;
  status: string;
  source: string;
  version: number;
  customerId: string | null;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  discountTotal: number;
  total: number;
  notes: string | null;
  businessDate: string;
  terminalId: string | null;
  employeeId: string | null;
  placedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    catalogItemId: string;
    catalogItemName: string;
    catalogItemSku: string | null;
    itemType: string;
    qty: number;
    unitPrice: number;
    originalUnitPrice: number | null;
    priceOverrideReason: string | null;
    lineSubtotal: number;
    lineTax: number;
    lineTotal: number;
    taxCalculationMode: string | null;
    modifiers: unknown;
    specialInstructions: string | null;
    selectedOptions: unknown;
    packageComponents: unknown;
    notes: string | null;
    sortOrder: number;
    taxes: Array<{
      taxName: string;
      rateDecimal: string;
      amount: number;
    }>;
  }>;
  charges: Array<{
    id: string;
    chargeType: string;
    name: string;
    calculationType: string;
    value: number;
    amount: number;
  }>;
  discounts: Array<{
    id: string;
    type: string;
    value: number;
    amount: number;
    reason: string | null;
  }>;
}

export async function getOrder(tenantId: string, orderId: string): Promise<OrderDetail> {
  return withTenant(tenantId, async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    const [lines, charges, discounts] = await Promise.all([
      tx.select().from(orderLines).where(eq(orderLines.orderId, orderId)),
      tx.select().from(orderCharges).where(eq(orderCharges.orderId, orderId)),
      tx.select().from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId)),
    ]);

    const lineIds = lines.map((l) => l.id);
    let lineTaxes: (typeof orderLineTaxes.$inferSelect)[] = [];
    if (lineIds.length > 0) {
      lineTaxes = await tx
        .select()
        .from(orderLineTaxes)
        .where(inArray(orderLineTaxes.orderLineId, lineIds));
    }

    return {
      ...order,
      lines: lines.map((l) => ({
        id: l.id,
        catalogItemId: l.catalogItemId,
        catalogItemName: l.catalogItemName,
        catalogItemSku: l.catalogItemSku,
        itemType: l.itemType,
        qty: Number(l.qty),
        unitPrice: l.unitPrice,
        originalUnitPrice: l.originalUnitPrice ?? null,
        priceOverrideReason: l.priceOverrideReason ?? null,
        lineSubtotal: l.lineSubtotal,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
        taxCalculationMode: l.taxCalculationMode ?? null,
        modifiers: l.modifiers,
        specialInstructions: l.specialInstructions,
        selectedOptions: l.selectedOptions,
        packageComponents: l.packageComponents ?? null,
        notes: l.notes ?? null,
        sortOrder: l.sortOrder,
        taxes: lineTaxes
          .filter((t) => t.orderLineId === l.id)
          .map((t) => ({
            taxName: t.taxName,
            rateDecimal: t.rateDecimal,
            amount: t.amount,
          })),
      })),
      charges: charges.map((c) => ({
        id: c.id,
        chargeType: c.chargeType,
        name: c.name,
        calculationType: c.calculationType,
        value: c.value,
        amount: c.amount,
      })),
      discounts: discounts.map((d) => ({
        id: d.id,
        type: d.type,
        value: d.value,
        amount: d.amount,
        reason: d.reason,
      })),
    };
  });
}
