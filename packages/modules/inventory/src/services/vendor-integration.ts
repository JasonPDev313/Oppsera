/**
 * Vendor integration hooks — consumed by the receiving module.
 */
import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { itemVendors } from '@oppsera/db';

// ── getVendorItemDefaults ─────────────────────────────────────────
// Called by the receiving UI when a user selects an item on a receipt line.
// Returns vendor-specific cost + SKU for auto-fill.

export interface VendorItemDefaults {
  vendorSku: string | null;
  vendorCost: number | null;
  lastCost: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
}

export async function getVendorItemDefaults(
  tenantId: string,
  vendorId: string,
  inventoryItemId: string,
): Promise<VendorItemDefaults | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        vendorSku: itemVendors.vendorSku,
        vendorCost: itemVendors.vendorCost,
        lastCost: itemVendors.lastCost,
        leadTimeDays: itemVendors.leadTimeDays,
        isPreferred: itemVendors.isPreferred,
      })
      .from(itemVendors)
      .where(
        and(
          eq(itemVendors.tenantId, tenantId),
          eq(itemVendors.vendorId, vendorId),
          eq(itemVendors.inventoryItemId, inventoryItemId),
          eq(itemVendors.isActive, true),
        ),
      )
      .limit(1);

    if (!rows[0]) return null;

    return {
      vendorSku: rows[0].vendorSku ?? null,
      vendorCost: rows[0].vendorCost ? Number(rows[0].vendorCost) : null,
      lastCost: rows[0].lastCost ? Number(rows[0].lastCost) : null,
      leadTimeDays: rows[0].leadTimeDays ?? null,
      isPreferred: rows[0].isPreferred,
    };
  });
}

// ── updateVendorItemCostAfterReceipt ──────────────────────────────
// Called INSIDE the postReceipt() transaction (Rule VM-4).
// Upserts item_vendors: updates last_cost + vendor_cost if row exists,
// auto-creates row if vendor+item pair doesn't exist.

export async function updateVendorItemCostAfterReceipt(
  tx: any,
  tenantId: string,
  vendorId: string,
  inventoryItemId: string,
  landedUnitCost: number,
) {
  const costStr = landedUnitCost.toString();
  const now = new Date();

  // Check if row exists
  const existing = await tx
    .select({ id: itemVendors.id })
    .from(itemVendors)
    .where(
      and(
        eq(itemVendors.tenantId, tenantId),
        eq(itemVendors.vendorId, vendorId),
        eq(itemVendors.inventoryItemId, inventoryItemId),
      ),
    );

  if (existing[0]) {
    // Update existing: set last_cost, last_received_at, and vendor_cost
    await tx
      .update(itemVendors)
      .set({
        lastCost: costStr,
        lastReceivedAt: now,
        vendorCost: costStr,
        updatedAt: now,
      })
      .where(eq(itemVendors.id, existing[0].id));
  } else {
    // Auto-create new mapping
    await tx
      .insert(itemVendors)
      .values({
        tenantId,
        vendorId,
        inventoryItemId,
        vendorCost: costStr,
        lastCost: costStr,
        lastReceivedAt: now,
        isPreferred: false,
        isActive: true,
      });
  }
}
