import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  inventoryItems,
  itemIdentifiers,
  itemVendors,
} from '@oppsera/db';

export interface SearchItemResult {
  id: string;
  name: string;
  sku: string | null;
  baseUnit: string;
  costingMethod: string;
  currentCost: number;
  standardCost: number | null;
  matchedIdentifier: string | null;
  matchedIdentifierType: string | null;
  vendorCost: number | null;
  vendorSku: string | null;
}

/**
 * Search items for receiving — first checks item_identifiers (barcode/UPC scan),
 * then falls back to inventoryItems.sku / name ILIKE.
 */
export async function searchItemsForReceiving(
  tenantId: string,
  locationId: string,
  query: string,
  vendorId?: string,
): Promise<SearchItemResult[]> {
  return withTenant(tenantId, async (tx) => {
    const results: SearchItemResult[] = [];
    const seenIds = new Set<string>();

    // 1. Search by identifier (exact match — barcode scan)
    const identifierRows = await tx
      .select({
        item: inventoryItems,
        identifierValue: itemIdentifiers.value,
        identifierType: itemIdentifiers.identifierType,
      })
      .from(itemIdentifiers)
      .innerJoin(inventoryItems, eq(itemIdentifiers.inventoryItemId, inventoryItems.id))
      .where(
        and(
          eq(itemIdentifiers.tenantId, tenantId),
          eq(itemIdentifiers.value, query),
          eq(inventoryItems.locationId, locationId),
          eq(inventoryItems.status, 'active'),
        ),
      )
      .limit(10);

    for (const r of identifierRows) {
      if (seenIds.has(r.item.id)) continue;
      seenIds.add(r.item.id);

      const vendorInfo = vendorId
        ? await getVendorInfo(tx, tenantId, r.item.id, vendorId)
        : null;

      results.push({
        id: r.item.id,
        name: r.item.name,
        sku: r.item.sku ?? null,
        baseUnit: r.item.baseUnit,
        costingMethod: r.item.costingMethod,
        currentCost: Number(r.item.currentCost ?? 0),
        standardCost: r.item.standardCost ? Number(r.item.standardCost) : null,
        matchedIdentifier: r.identifierValue,
        matchedIdentifierType: r.identifierType,
        vendorCost: vendorInfo?.vendorCost ?? null,
        vendorSku: vendorInfo?.vendorSku ?? null,
      });
    }

    // 2. Fallback: search by SKU or name ILIKE
    if (results.length === 0) {
      const likeQuery = `%${query}%`;
      const nameSkuRows = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.locationId, locationId),
            eq(inventoryItems.status, 'active'),
            sql`(${inventoryItems.name} ILIKE ${likeQuery} OR ${inventoryItems.sku} ILIKE ${likeQuery})`,
          ),
        )
        .limit(20);

      for (const item of nameSkuRows) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const vendorInfo = vendorId
          ? await getVendorInfo(tx, tenantId, item.id, vendorId)
          : null;

        results.push({
          id: item.id,
          name: item.name,
          sku: item.sku ?? null,
          baseUnit: item.baseUnit,
          costingMethod: item.costingMethod,
          currentCost: Number(item.currentCost ?? 0),
          standardCost: item.standardCost ? Number(item.standardCost) : null,
          matchedIdentifier: null,
          matchedIdentifierType: null,
          vendorCost: vendorInfo?.vendorCost ?? null,
          vendorSku: vendorInfo?.vendorSku ?? null,
        });
      }
    }

    return results;
  });
}

async function getVendorInfo(
  tx: any,
  tenantId: string,
  inventoryItemId: string,
  vendorId: string,
): Promise<{ vendorCost: number | null; vendorSku: string | null } | null> {
  const rows = await tx
    .select()
    .from(itemVendors)
    .where(
      and(
        eq(itemVendors.tenantId, tenantId),
        eq(itemVendors.inventoryItemId, inventoryItemId),
        eq(itemVendors.vendorId, vendorId),
      ),
    )
    .limit(1);

  if (!rows[0]) return null;
  return {
    vendorCost: rows[0].vendorCost ? Number(rows[0].vendorCost) : null,
    vendorSku: rows[0].vendorSku ?? null,
  };
}
