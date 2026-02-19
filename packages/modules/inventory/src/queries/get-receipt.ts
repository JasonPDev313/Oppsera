import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  receivingReceipts,
  receivingReceiptLines,
  receiptCharges,
  inventoryItems,
  vendors,
  itemVendors,
} from '@oppsera/db';
import { costPreview } from '../services/costing';

export interface ReceiptChargeDetail {
  id: string;
  chargeType: string;
  description: string | null;
  amount: number;
  glAccountCode: string | null;
  glAccountName: string | null;
  sortOrder: number;
}

export interface ReceiptLineDetail {
  id: string;
  inventoryItemId: string;
  itemName: string;
  itemSku: string | null;
  vendorItemId: string | null;
  quantityReceived: number;
  uomCode: string;
  unitCost: number;
  extendedCost: number;
  allocatedShipping: number;
  landedCost: number;
  landedUnitCost: number;
  baseQty: number;
  weight: number | null;
  volume: number | null;
  lotNumber: string | null;
  serialNumbers: string[] | null;
  expirationDate: string | null;
  sortOrder: number;
  notes: string | null;
  costPreview: {
    currentOnHand: number;
    currentCost: number;
    newCost: number;
    newOnHand: number;
    marginPct: number | null;
  } | null;
}

export interface ReceiptDetail {
  id: string;
  tenantId: string;
  locationId: string;
  vendorId: string;
  vendorName: string;
  receiptNumber: string;
  status: string;
  vendorInvoiceNumber: string | null;
  receivedDate: string;
  freightMode: string;
  shippingCost: number;
  shippingAllocationMethod: string;
  taxAmount: number;
  subtotal: number;
  total: number;
  notes: string | null;
  postedAt: string | null;
  postedBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines: ReceiptLineDetail[];
  charges: ReceiptChargeDetail[];
}

export async function getReceipt(
  tenantId: string,
  receiptId: string,
): Promise<ReceiptDetail | null> {
  return withTenant(tenantId, async (tx) => {
    // Load receipt with vendor name
    const receiptRows = await tx
      .select({
        receipt: receivingReceipts,
        vendorName: vendors.name,
      })
      .from(receivingReceipts)
      .innerJoin(vendors, eq(receivingReceipts.vendorId, vendors.id))
      .where(
        and(
          eq(receivingReceipts.tenantId, tenantId),
          eq(receivingReceipts.id, receiptId),
        ),
      );

    const row = receiptRows[0];
    if (!row) return null;
    const receipt = row.receipt;

    // Load lines with item details
    const lineRows = await tx
      .select({
        line: receivingReceiptLines,
        itemName: inventoryItems.name,
        itemSku: inventoryItems.sku,
        itemCostingMethod: inventoryItems.costingMethod,
        itemCurrentCost: inventoryItems.currentCost,
        itemStandardCost: inventoryItems.standardCost,
      })
      .from(receivingReceiptLines)
      .innerJoin(inventoryItems, eq(receivingReceiptLines.inventoryItemId, inventoryItems.id))
      .where(
        and(
          eq(receivingReceiptLines.tenantId, tenantId),
          eq(receivingReceiptLines.receiptId, receiptId),
        ),
      )
      .orderBy(receivingReceiptLines.sortOrder);

    // Load charges
    const chargeRows = await tx
      .select()
      .from(receiptCharges)
      .where(
        and(
          eq(receiptCharges.tenantId, tenantId),
          eq(receiptCharges.receiptId, receiptId),
        ),
      )
      .orderBy(receiptCharges.sortOrder);

    const charges: ReceiptChargeDetail[] = chargeRows.map((c) => ({
      id: c.id,
      chargeType: c.chargeType,
      description: c.description ?? null,
      amount: Number(c.amount),
      glAccountCode: c.glAccountCode ?? null,
      glAccountName: c.glAccountName ?? null,
      sortOrder: c.sortOrder,
    }));

    // Compute on-hand for each item (for cost preview on drafts)
    const itemIds = [...new Set(lineRows.map((r) => r.line.inventoryItemId))];
    const onHandMap = new Map<string, number>();

    if (itemIds.length > 0 && receipt.status === 'draft') {
      const idList = sql.join(itemIds.map((id) => sql`${id}`), sql`, `);
      const onHandRows = await tx.execute(
        sql`SELECT inventory_item_id, COALESCE(SUM(quantity_delta), 0) as on_hand
            FROM inventory_movements
            WHERE tenant_id = ${tenantId}
              AND inventory_item_id IN (${idList})
            GROUP BY inventory_item_id`,
      );
      const arr = Array.from(onHandRows as Iterable<{ inventory_item_id: string; on_hand: string }>);
      for (const r of arr) {
        onHandMap.set(r.inventory_item_id, parseFloat(r.on_hand));
      }
    }

    const lines: ReceiptLineDetail[] = lineRows.map((r) => {
      const l = r.line;
      const baseQty = Number(l.baseQty);
      const landedUnit = Number(l.landedUnitCost);
      const currentOnHand = onHandMap.get(l.inventoryItemId) ?? 0;
      const currentCost = Number(r.itemCurrentCost ?? 0);
      const method = (r.itemCostingMethod ?? 'fifo') as 'weighted_avg' | 'fifo' | 'standard';

      let preview = null;
      if (receipt.status === 'draft' && baseQty > 0) {
        preview = {
          currentOnHand,
          currentCost,
          ...costPreview(currentOnHand, currentCost, null, baseQty, landedUnit, method),
        };
      }

      return {
        id: l.id,
        inventoryItemId: l.inventoryItemId,
        itemName: r.itemName,
        itemSku: r.itemSku ?? null,
        vendorItemId: l.vendorItemId ?? null,
        quantityReceived: Number(l.quantityReceived),
        uomCode: l.uomCode,
        unitCost: Number(l.unitCost),
        extendedCost: Number(l.extendedCost),
        allocatedShipping: Number(l.allocatedShipping),
        landedCost: Number(l.landedCost),
        landedUnitCost: landedUnit,
        baseQty,
        weight: l.weight ? Number(l.weight) : null,
        volume: l.volume ? Number(l.volume) : null,
        lotNumber: l.lotNumber ?? null,
        serialNumbers: l.serialNumbers as string[] | null,
        expirationDate: l.expirationDate ?? null,
        sortOrder: l.sortOrder,
        notes: l.notes ?? null,
        costPreview: preview,
      };
    });

    return {
      id: receipt.id,
      tenantId: receipt.tenantId,
      locationId: receipt.locationId,
      vendorId: receipt.vendorId,
      vendorName: row.vendorName,
      receiptNumber: receipt.receiptNumber,
      status: receipt.status,
      vendorInvoiceNumber: receipt.vendorInvoiceNumber ?? null,
      receivedDate: receipt.receivedDate,
      freightMode: receipt.freightMode ?? 'allocate',
      shippingCost: Number(receipt.shippingCost),
      shippingAllocationMethod: receipt.shippingAllocationMethod,
      taxAmount: Number(receipt.taxAmount),
      subtotal: Number(receipt.subtotal),
      total: Number(receipt.total),
      notes: receipt.notes ?? null,
      postedAt: receipt.postedAt?.toISOString() ?? null,
      postedBy: receipt.postedBy ?? null,
      voidedAt: receipt.voidedAt?.toISOString() ?? null,
      voidedBy: receipt.voidedBy ?? null,
      createdBy: receipt.createdBy,
      createdAt: receipt.createdAt.toISOString(),
      updatedAt: receipt.updatedAt.toISOString(),
      lines,
      charges,
    };
  });
}
