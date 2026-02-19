import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  receivingReceipts,
  receivingReceiptLines,
  inventoryItems,
  inventoryMovements,
  itemUomConversions,
  uoms,
} from '@oppsera/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { checkStockAlerts } from '../../helpers/stock-alerts';
import { recomputeAllLines, type ReceiptLineInput } from '../../services/receipt-calculator';
import { weightedAvgCost, lastCost } from '../../services/costing';
import type { AllocationMethod } from '../../services/shipping-allocation';
import type { PostReceiptInput } from '../../validation/receiving';

export async function postReceipt(
  ctx: RequestContext,
  input: PostReceiptInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load receipt
    const receiptRows = await (tx as any)
      .select()
      .from(receivingReceipts)
      .where(
        and(
          eq(receivingReceipts.tenantId, ctx.tenantId),
          eq(receivingReceipts.id, input.receiptId),
        ),
      );
    const receipt = receiptRows[0];
    if (!receipt) throw new NotFoundError('Receipt');

    // Idempotent: if already posted, return existing
    if (receipt.status === 'posted') {
      return { result: receipt, events: [] };
    }
    if (receipt.status !== 'draft') {
      throw new ValidationError('Only draft receipts can be posted');
    }

    // 2. Load all lines (must have >= 1)
    const lineRows = await (tx as any)
      .select()
      .from(receivingReceiptLines)
      .where(
        and(
          eq(receivingReceiptLines.tenantId, ctx.tenantId),
          eq(receivingReceiptLines.receiptId, input.receiptId),
        ),
      );
    if (lineRows.length === 0) {
      throw new ValidationError('Cannot post a receipt with no lines');
    }

    // ── Batch-load all reference data upfront (eliminates N+1) ──────

    const itemIdSet = new Set<string>();
    for (const l of lineRows) itemIdSet.add((l as any).inventoryItemId);
    const uniqueItemIds: string[] = [...itemIdSet];

    // Batch-load all inventory items (needed for base_unit, costing method, cost)
    const allItemRows = uniqueItemIds.length > 0
      ? await (tx as any)
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.tenantId, ctx.tenantId),
              inArray(inventoryItems.id, uniqueItemIds),
            ),
          )
      : [];
    const itemMap = new Map<string, any>();
    for (const item of allItemRows) itemMap.set(item.id, item);

    // Batch-load UOM conversions for all items
    const conversionMap = new Map<string, number>(); // "itemId:uomCode" -> factor
    if (uniqueItemIds.length > 0) {
      const convRows = await (tx as any)
        .select({
          inventoryItemId: itemUomConversions.inventoryItemId,
          fromUomId: itemUomConversions.fromUomId,
          conversionFactor: itemUomConversions.conversionFactor,
        })
        .from(itemUomConversions)
        .where(
          and(
            eq(itemUomConversions.tenantId, ctx.tenantId),
            inArray(itemUomConversions.inventoryItemId, uniqueItemIds),
          ),
        );

      // Batch-load UOMs to resolve id -> code mapping
      const uomIdSet = new Set<string>(convRows.map((r: any) => r.fromUomId));
      const uomIdArr: string[] = [...uomIdSet];
      const uomMap = new Map<string, string>(); // uom.id -> uom.code
      if (uomIdArr.length > 0) {
        const uomRows = await (tx as any)
          .select({ id: uoms.id, code: uoms.code })
          .from(uoms)
          .where(
            and(
              eq(uoms.tenantId, ctx.tenantId),
              inArray(uoms.id, uomIdArr),
            ),
          );
        for (const u of uomRows) uomMap.set(u.id, u.code);
      }

      for (const conv of convRows) {
        const code = uomMap.get(conv.fromUomId);
        if (code) {
          conversionMap.set(
            `${conv.inventoryItemId}:${code.toLowerCase()}`,
            Number(conv.conversionFactor),
          );
        }
      }
    }

    function getConversionFactor(inventoryItemId: string, uomCode: string): number {
      const item = itemMap.get(inventoryItemId);
      if (!item) return 1;
      if (uomCode.toLowerCase() === item.baseUnit.toLowerCase()) return 1;
      return conversionMap.get(`${inventoryItemId}:${uomCode.toLowerCase()}`) ?? 1;
    }

    // 3. Recompute all lines from scratch (Rule 5)
    const lineInputs: ReceiptLineInput[] = lineRows.map((line: any) => ({
      id: line.id,
      quantityReceived: Number(line.quantityReceived),
      unitCost: Number(line.unitCost),
      conversionFactor: getConversionFactor(line.inventoryItemId, line.uomCode),
      weight: line.weight ? Number(line.weight) : null,
      volume: line.volume ? Number(line.volume) : null,
    }));

    const shippingCost = Number(receipt.shippingCost);
    const allocationMethod = receipt.shippingAllocationMethod as AllocationMethod;
    const freightMode = (receipt.freightMode ?? 'allocate') as 'expense' | 'allocate';
    const { computed, subtotal } = recomputeAllLines(lineInputs, shippingCost, allocationMethod, freightMode);

    // 4. Batch-update all recomputed line values (single SQL)
    const lineUpdateCases = computed.map((c) => sql`(
      ${c.id},
      ${c.extendedCost.toString()}::numeric,
      ${c.baseQty.toString()}::numeric,
      ${c.allocatedShipping.toString()}::numeric,
      ${c.landedCost.toString()}::numeric,
      ${c.landedUnitCost.toString()}::numeric
    )`);
    if (lineUpdateCases.length > 0) {
      await tx.execute(sql`
        UPDATE receiving_receipt_lines AS rl SET
          extended_cost = v.ext_cost,
          base_qty = v.base_qty,
          allocated_shipping = v.alloc_ship,
          landed_cost = v.landed,
          landed_unit_cost = v.landed_unit,
          updated_at = now()
        FROM (VALUES ${sql.join(lineUpdateCases, sql`, `)})
          AS v(line_id, ext_cost, base_qty, alloc_ship, landed, landed_unit)
        WHERE rl.id = v.line_id::text
      `);
    }

    // 5. Batch-insert all inventory movements (single INSERT)
    const movementValues = lineRows.map((line: any) => {
      const comp = computed.find((c) => c.id === line.id)!;
      return {
        tenantId: ctx.tenantId,
        locationId: receipt.locationId,
        inventoryItemId: line.inventoryItemId,
        movementType: 'receive',
        quantityDelta: comp.baseQty.toString(),
        unitCost: comp.landedUnitCost.toString(),
        extendedCost: comp.landedCost.toString(),
        referenceType: 'receiving_receipt',
        referenceId: input.receiptId,
        reason: `Receipt ${receipt.receiptNumber}`,
        source: 'manual',
        businessDate: receipt.receivedDate,
        employeeId: ctx.user.id,
        batchId: input.receiptId,
        metadata: {
          receiptNumber: receipt.receiptNumber,
          lineId: line.id,
          uomCode: line.uomCode,
          quantityReceived: Number(line.quantityReceived),
        },
        createdBy: ctx.user.id,
      };
    });
    if (movementValues.length > 0) {
      await (tx as any).insert(inventoryMovements).values(movementValues);
    }

    // 6. Batch-compute on-hand for all items (single GROUP BY query)
    const onHandMap = new Map<string, number>();
    if (uniqueItemIds.length > 0) {
      const onHandRows = await tx.execute(sql`
        SELECT inventory_item_id, COALESCE(SUM(quantity_delta), 0) AS total
        FROM inventory_movements
        WHERE tenant_id = ${ctx.tenantId}
          AND inventory_item_id IN (${sql.join(uniqueItemIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY inventory_item_id
      `);
      for (const row of Array.from(onHandRows as Iterable<Record<string, unknown>>)) {
        onHandMap.set(row.inventory_item_id as string, parseFloat(row.total as string));
      }
    }

    // 7. Compute new costs per item + collect stock alerts
    const allEvents: any[] = [];
    const costUpdates: Array<{ id: string; newCost: number }> = [];

    for (const line of lineRows) {
      const comp = computed.find((c) => c.id === (line as any).id)!;
      const item = itemMap.get((line as any).inventoryItemId);
      if (!item) continue;

      const currentOnHand = onHandMap.get(item.id) ?? 0;
      const prevOnHand = currentOnHand - comp.baseQty;
      const prevCost = Number(item.currentCost ?? 0);

      let newCost: number;
      const method = item.costingMethod ?? 'fifo';
      if (method === 'weighted_avg') {
        newCost = weightedAvgCost(prevOnHand, prevCost, comp.baseQty, comp.landedUnitCost);
      } else if (method === 'standard') {
        newCost = prevCost;
      } else {
        newCost = lastCost(comp.landedUnitCost);
      }

      costUpdates.push({ id: item.id, newCost });

      // Stock alerts (pure function, no DB)
      const alertEvents = checkStockAlerts(ctx, {
        inventoryItemId: item.id,
        catalogItemId: item.catalogItemId,
        locationId: receipt.locationId,
        itemName: item.name,
        currentOnHand,
        reorderPoint: item.reorderPoint != null ? parseFloat(item.reorderPoint) : null,
        reorderQuantity: item.reorderQuantity != null ? parseFloat(item.reorderQuantity) : null,
      });
      allEvents.push(...alertEvents);
    }

    // 8. Batch-update inventory item costs (single SQL)
    if (costUpdates.length > 0) {
      const costCases = costUpdates.map((u) => sql`(${u.id}, ${u.newCost.toString()}::numeric)`);
      await tx.execute(sql`
        UPDATE inventory_items AS ii SET
          current_cost = v.new_cost,
          updated_at = now()
        FROM (VALUES ${sql.join(costCases, sql`, `)})
          AS v(item_id, new_cost)
        WHERE ii.id = v.item_id::text
      `);
    }

    // 9. Batch-upsert vendor-item costs (Rule VM-4, single SQL)
    if (receipt.vendorId) {
      // Deduplicate by inventoryItemId (take last cost if same item on multiple lines)
      const deduped = new Map<string, number>();
      for (const line of lineRows) {
        const comp = computed.find((c) => c.id === (line as any).id)!;
        deduped.set((line as any).inventoryItemId, comp.landedUnitCost);
      }

      const upsertValues = [...deduped.entries()].map(
        ([itemId, cost]) => sql`(${ctx.tenantId}, ${itemId}, ${receipt.vendorId}, ${cost.toString()}::numeric)`,
      );

      if (upsertValues.length > 0) {
        // ON CONFLICT matches unique index: (tenant_id, inventory_item_id, vendor_id)
        await tx.execute(sql`
          INSERT INTO item_vendors
            (tenant_id, inventory_item_id, vendor_id, vendor_cost, last_cost, last_received_at, is_preferred, is_active)
          SELECT v.tid, v.iid, v.vid, v.cost, v.cost, now(), false, true
          FROM (VALUES ${sql.join(upsertValues, sql`, `)}) AS v(tid, iid, vid, cost)
          ON CONFLICT (tenant_id, inventory_item_id, vendor_id) DO UPDATE SET
            last_cost = EXCLUDED.last_cost,
            vendor_cost = EXCLUDED.vendor_cost,
            last_received_at = now(),
            updated_at = now()
        `);
      }
    }

    // 10. Update receipt: status='posted', final totals
    const taxAmt = Number(receipt.taxAmount);
    const total = Math.round((subtotal + shippingCost + taxAmt) * 10000) / 10000;

    const [postedReceipt] = await (tx as any)
      .update(receivingReceipts)
      .set({
        status: 'posted',
        subtotal: subtotal.toString(),
        total: total.toString(),
        postedAt: new Date(),
        postedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(receivingReceipts.id, input.receiptId))
      .returning();

    // 11. Build posted event
    const postedEvent = buildEventFromContext(ctx, 'inventory.receipt.posted.v1', {
      receiptId: input.receiptId,
      receiptNumber: receipt.receiptNumber,
      vendorId: receipt.vendorId,
      locationId: receipt.locationId,
      freightMode,
      lineCount: lineRows.length,
      subtotal,
      shippingCost,
      taxAmount: taxAmt,
      total,
    });

    return { result: postedReceipt, events: [postedEvent, ...allEvents] };
  });

  await auditLog(ctx, 'inventory.receipt.posted', 'receiving_receipt', input.receiptId);
  return result;
}
