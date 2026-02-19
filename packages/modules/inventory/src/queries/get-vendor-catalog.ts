import { eq, and, asc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { itemVendors, inventoryItems } from '@oppsera/db';

export interface VendorCatalogEntry {
  id: string;
  inventoryItemId: string;
  itemName: string;
  itemSku: string | null;
  vendorSku: string | null;
  vendorCost: number | null;
  lastCost: number | null;
  lastReceivedAt: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  minOrderQty: number | null;
  packSize: string | null;
  notes: string | null;
}

export interface GetVendorCatalogInput {
  tenantId: string;
  vendorId: string;
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface GetVendorCatalogResult {
  items: VendorCatalogEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getVendorCatalog(input: GetVendorCatalogInput): Promise<GetVendorCatalogResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(itemVendors.tenantId, input.tenantId),
      eq(itemVendors.vendorId, input.vendorId),
    ];

    if (input.isActive !== undefined) {
      conditions.push(eq(itemVendors.isActive, input.isActive));
    }
    if (input.cursor) {
      conditions.push(sql`${itemVendors.id} < ${input.cursor}` as any);
    }
    if (input.search) {
      conditions.push(
        sql`(${inventoryItems.name} ILIKE ${'%' + input.search + '%'} OR ${inventoryItems.sku} ILIKE ${'%' + input.search + '%'})` as any,
      );
    }

    const rows = await tx
      .select({
        id: itemVendors.id,
        inventoryItemId: itemVendors.inventoryItemId,
        itemName: inventoryItems.name,
        itemSku: inventoryItems.sku,
        vendorSku: itemVendors.vendorSku,
        vendorCost: itemVendors.vendorCost,
        lastCost: itemVendors.lastCost,
        lastReceivedAt: itemVendors.lastReceivedAt,
        leadTimeDays: itemVendors.leadTimeDays,
        isPreferred: itemVendors.isPreferred,
        isActive: itemVendors.isActive,
        minOrderQty: itemVendors.minOrderQty,
        packSize: itemVendors.packSize,
        notes: itemVendors.notes,
      })
      .from(itemVendors)
      .innerJoin(inventoryItems, eq(inventoryItems.id, itemVendors.inventoryItemId))
      .where(and(...conditions))
      .orderBy(asc(inventoryItems.name))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        inventoryItemId: r.inventoryItemId,
        itemName: r.itemName,
        itemSku: r.itemSku ?? null,
        vendorSku: r.vendorSku ?? null,
        vendorCost: r.vendorCost ? Number(r.vendorCost) : null,
        lastCost: r.lastCost ? Number(r.lastCost) : null,
        lastReceivedAt: r.lastReceivedAt ? (r.lastReceivedAt as Date).toISOString() : null,
        leadTimeDays: r.leadTimeDays ?? null,
        isPreferred: r.isPreferred,
        isActive: r.isActive,
        minOrderQty: r.minOrderQty ? Number(r.minOrderQty) : null,
        packSize: r.packSize ?? null,
        notes: r.notes ?? null,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── Reverse lookup: which vendors supply this item? ───────────────

export interface ItemVendorEntry {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorSku: string | null;
  vendorCost: number | null;
  lastCost: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
}

export async function getItemVendors(
  tenantId: string,
  inventoryItemId: string,
): Promise<ItemVendorEntry[]> {
  const { vendors } = await import('@oppsera/db');

  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: itemVendors.id,
        vendorId: itemVendors.vendorId,
        vendorName: vendors.name,
        vendorSku: itemVendors.vendorSku,
        vendorCost: itemVendors.vendorCost,
        lastCost: itemVendors.lastCost,
        leadTimeDays: itemVendors.leadTimeDays,
        isPreferred: itemVendors.isPreferred,
      })
      .from(itemVendors)
      .innerJoin(vendors, eq(vendors.id, itemVendors.vendorId))
      .where(
        and(
          eq(itemVendors.tenantId, tenantId),
          eq(itemVendors.inventoryItemId, inventoryItemId),
          eq(itemVendors.isActive, true),
        ),
      )
      .orderBy(sql`${itemVendors.isPreferred} DESC, ${vendors.name} ASC`);

    return rows.map((r) => ({
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      vendorSku: r.vendorSku ?? null,
      vendorCost: r.vendorCost ? Number(r.vendorCost) : null,
      lastCost: r.lastCost ? Number(r.lastCost) : null,
      leadTimeDays: r.leadTimeDays ?? null,
      isPreferred: r.isPreferred,
    }));
  });
}
