import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SearchItemResult {
  id: string;
  catalogItemId: string;
  inventoryItemId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  itemType: string;
  baseUnit: string;
  costingMethod: string;
  currentCost: number;
  standardCost: number | null;
  matchedOn: 'barcode' | 'sku' | 'name' | null;
  vendorCost: number | null;
  vendorSku: string | null;
}

/**
 * Search items for receiving — short-circuit tiered search.
 *
 * Tries exact matches first (fast B-tree lookups), only falls through to
 * fuzzy ILIKE search if no exact match is found. This avoids always running
 * the expensive trigram scan.
 *
 *   Tier 1: Exact barcode on catalog_items (B-tree index hit)
 *   Tier 2: Exact barcode/PLU on item_identifiers (B-tree index hit)
 *   Tier 3: Fuzzy name/SKU ILIKE (GIN trigram — only if tiers 1+2 returned nothing)
 */
export async function searchItemsForReceiving(
  tenantId: string,
  locationId: string,
  query: string,
  vendorId?: string,
): Promise<SearchItemResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return withTenant(tenantId, async (tx) => {
    // ── Tier 1: exact barcode on catalog_items ─────────────────
    const barcodeRows = await tx.execute(sql`
      SELECT
        ci.id            AS catalog_id,
        ci.name          AS catalog_name,
        ci.sku           AS catalog_sku,
        ci.barcode       AS catalog_barcode,
        ci.item_type     AS catalog_item_type,
        ci.cost          AS catalog_cost,
        ii.id            AS inv_id,
        ii.base_unit     AS inv_base_unit,
        ii.costing_method AS inv_costing_method,
        ii.current_cost  AS inv_current_cost,
        ii.standard_cost AS inv_standard_cost,
        iv.vendor_cost   AS vendor_cost,
        iv.vendor_sku    AS vendor_sku,
        'barcode'        AS matched_on
      FROM catalog_items ci
      LEFT JOIN inventory_items ii
        ON ii.catalog_item_id = ci.id AND ii.location_id = ${locationId}
      LEFT JOIN item_vendors iv
        ON iv.inventory_item_id = ii.id AND iv.is_active = true
        AND iv.vendor_id = ${vendorId ?? null}
      WHERE ci.tenant_id = ${tenantId}
        AND ci.barcode = ${trimmed}
        AND ci.archived_at IS NULL
      LIMIT 1
    `);

    if ((barcodeRows as any).length > 0) {
      return Array.from(barcodeRows as Iterable<Record<string, unknown>>).map(mapRow);
    }

    // ── Tier 2: exact match on item_identifiers ────────────────
    const identRows = await tx.execute(sql`
      SELECT
        ci.id            AS catalog_id,
        ci.name          AS catalog_name,
        ci.sku           AS catalog_sku,
        ci.barcode       AS catalog_barcode,
        ci.item_type     AS catalog_item_type,
        ci.cost          AS catalog_cost,
        ii.id            AS inv_id,
        ii.base_unit     AS inv_base_unit,
        ii.costing_method AS inv_costing_method,
        ii.current_cost  AS inv_current_cost,
        ii.standard_cost AS inv_standard_cost,
        iv.vendor_cost   AS vendor_cost,
        iv.vendor_sku    AS vendor_sku,
        'barcode'        AS matched_on
      FROM item_identifiers iid
      JOIN inventory_items ii ON ii.id = iid.inventory_item_id AND ii.location_id = ${locationId}
      JOIN catalog_items ci ON ci.id = ii.catalog_item_id
      LEFT JOIN item_vendors iv
        ON iv.inventory_item_id = ii.id AND iv.is_active = true
        AND iv.vendor_id = ${vendorId ?? null}
      WHERE iid.tenant_id = ${tenantId}
        AND iid.value = ${trimmed}
        AND ci.archived_at IS NULL
      LIMIT 5
    `);

    if ((identRows as any).length > 0) {
      return Array.from(identRows as Iterable<Record<string, unknown>>).map(mapRow);
    }

    // ── Tier 3: fuzzy name/SKU ILIKE (GIN trigram) ─────────────
    // Only runs if exact matches found nothing — this is the expensive path.
    const likePattern = `%${trimmed}%`;
    const fuzzyRows = await tx.execute(sql`
      SELECT
        ci.id            AS catalog_id,
        ci.name          AS catalog_name,
        ci.sku           AS catalog_sku,
        ci.barcode       AS catalog_barcode,
        ci.item_type     AS catalog_item_type,
        ci.cost          AS catalog_cost,
        ii.id            AS inv_id,
        ii.base_unit     AS inv_base_unit,
        ii.costing_method AS inv_costing_method,
        ii.current_cost  AS inv_current_cost,
        ii.standard_cost AS inv_standard_cost,
        iv.vendor_cost   AS vendor_cost,
        iv.vendor_sku    AS vendor_sku,
        CASE
          WHEN ci.sku IS NOT NULL AND ci.sku ILIKE ${likePattern} THEN 'sku'
          ELSE 'name'
        END AS matched_on
      FROM catalog_items ci
      LEFT JOIN inventory_items ii
        ON ii.catalog_item_id = ci.id AND ii.location_id = ${locationId}
      LEFT JOIN item_vendors iv
        ON iv.inventory_item_id = ii.id AND iv.is_active = true
        AND iv.vendor_id = ${vendorId ?? null}
      WHERE ci.tenant_id = ${tenantId}
        AND ci.archived_at IS NULL
        AND (ci.name ILIKE ${likePattern} OR ci.sku ILIKE ${likePattern})
      ORDER BY
        CASE WHEN ci.name ILIKE ${`${trimmed}%`} THEN 0 ELSE 1 END,
        ci.name
      LIMIT 20
    `);

    return Array.from(fuzzyRows as Iterable<Record<string, unknown>>).map(mapRow);
  });
}

function mapRow(r: Record<string, unknown>): SearchItemResult {
  const invId = r.inv_id as string | null;
  const catalogId = r.catalog_id as string;
  return {
    id: invId ?? catalogId,
    catalogItemId: catalogId,
    inventoryItemId: invId ?? null,
    name: r.catalog_name as string,
    sku: (r.catalog_sku as string | null) ?? null,
    barcode: (r.catalog_barcode as string | null) ?? null,
    itemType: r.catalog_item_type as string,
    baseUnit: (r.inv_base_unit as string | null) ?? 'each',
    costingMethod: (r.inv_costing_method as string | null) ?? 'fifo',
    currentCost: r.inv_current_cost ? Number(r.inv_current_cost) : Number(r.catalog_cost ?? 0),
    standardCost: r.inv_standard_cost ? Number(r.inv_standard_cost) : null,
    matchedOn: (r.matched_on as 'barcode' | 'sku' | 'name') ?? null,
    vendorCost: r.vendor_cost ? Number(r.vendor_cost) : null,
    vendorSku: (r.vendor_sku as string | null) ?? null,
  };
}
