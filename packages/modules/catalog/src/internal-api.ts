import { eq, and, inArray, asc, isNull, sql } from 'drizzle-orm';
import { withTenant, sqlArray } from '@oppsera/db';
import {
  catalogItems,
  catalogLocationPrices,
  catalogItemModifierGroups,
  catalogModifierGroups,
  catalogModifiers,
  taxRates,
  taxGroups,
  taxGroupRates,
  catalogItemLocationTaxGroups,
} from './schema';
import type {
  CatalogReadApi,
  CatalogItemRecord,
  CatalogItemWithModifiers,
  ModifierGroupWithModifiers,
  ItemTaxInfo,
  PosItemData,
} from '@oppsera/core/helpers/catalog-read-api';

// ── Implementation ──────────────────────────────────────────────

class DrizzleCatalogReadApi implements CatalogReadApi {
  async getItem(tenantId: string, itemId: string): Promise<CatalogItemRecord | null> {
    return withTenant(tenantId, async (tx) => {
      const [item] = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.id, itemId),
            eq(catalogItems.tenantId, tenantId),
            isNull(catalogItems.archivedAt),
          ),
        )
        .limit(1);

      return item ?? null;
    });
  }

  async getEffectivePrice(
    tenantId: string,
    itemId: string,
    locationId: string,
  ): Promise<number> {
    return withTenant(tenantId, async (tx) => {
      const [override] = await tx
        .select()
        .from(catalogLocationPrices)
        .where(
          and(
            eq(catalogLocationPrices.catalogItemId, itemId),
            eq(catalogLocationPrices.locationId, locationId),
            eq(catalogLocationPrices.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (override) {
        return Number(override.price);
      }

      const [item] = await tx
        .select()
        .from(catalogItems)
        .where(
          and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)),
        )
        .limit(1);

      if (!item) {
        return 0;
      }

      return Number(item.defaultPrice);
    });
  }

  async getItemsWithModifiers(
    tenantId: string,
    itemIds: string[],
  ): Promise<CatalogItemWithModifiers[]> {
    // Drizzle-inferred types are structurally compatible with CatalogItemWithModifiers
    if (itemIds.length === 0) return [];

    return withTenant(tenantId, async (tx) => {
      const items = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            inArray(catalogItems.id, itemIds),
            eq(catalogItems.tenantId, tenantId),
          ),
        );

      if (items.length === 0) return [];

      const foundIds = items.map((i) => i.id);

      const junctions = await tx
        .select()
        .from(catalogItemModifierGroups)
        .where(inArray(catalogItemModifierGroups.catalogItemId, foundIds));

      const groupIds = [...new Set(junctions.map((j) => j.modifierGroupId))];

      if (groupIds.length === 0) {
        return items.map((item) => ({ ...item, modifierGroups: [] }));
      }

      const groups = await tx
        .select()
        .from(catalogModifierGroups)
        .where(inArray(catalogModifierGroups.id, groupIds));

      const modifiers = await tx
        .select()
        .from(catalogModifiers)
        .where(
          and(
            inArray(catalogModifiers.modifierGroupId, groupIds),
            eq(catalogModifiers.isActive, true),
          ),
        );

      const groupMap = new Map<string, ModifierGroupWithModifiers>();
      for (const group of groups) {
        groupMap.set(group.id, {
          ...group,
          modifiers: modifiers.filter((m) => m.modifierGroupId === group.id),
        });
      }

      return items.map((item) => {
        const itemGroupIds = junctions
          .filter((j) => j.catalogItemId === item.id)
          .map((j) => j.modifierGroupId);

        const itemGroups = itemGroupIds
          .map((gId) => groupMap.get(gId))
          .filter((g): g is ModifierGroupWithModifiers => g !== undefined);

        return { ...item, modifierGroups: itemGroups };
      });
    });
  }

  async getSubDepartmentForItem(
    tenantId: string,
    itemId: string,
  ): Promise<string | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT COALESCE(cat.parent_id, cat.id) AS sub_department_id
        FROM catalog_items ci
        JOIN catalog_categories cat ON cat.id = ci.category_id
        WHERE ci.id = ${itemId}
          AND ci.tenant_id = ${tenantId}
        LIMIT 1
      `);
      const arr = Array.from(rows as Iterable<Record<string, unknown>>);
      return arr.length > 0 ? (arr[0]!.sub_department_id as string) : null;
    });
  }

  async getAssignedModifierGroupIds(
    tenantId: string,
    catalogItemIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (catalogItemIds.length === 0) return result;

    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          catalogItemId: catalogItemModifierGroups.catalogItemId,
          modifierGroupId: catalogItemModifierGroups.modifierGroupId,
        })
        .from(catalogItemModifierGroups)
        .where(inArray(catalogItemModifierGroups.catalogItemId, catalogItemIds));

      for (const row of rows) {
        const existing = result.get(row.catalogItemId) ?? [];
        existing.push(row.modifierGroupId);
        result.set(row.catalogItemId, existing);
      }

      return result;
    });
  }

  async getItemForPOS(
    tenantId: string,
    locationId: string,
    itemId: string,
  ): Promise<PosItemData | null> {
    // Consolidated into a SINGLE withTenant call (1 semaphore slot) instead of
    // 4 separate withTenant calls. See core/catalog-read-api.ts for full explanation.
    return withTenant(tenantId, async (tx) => {
      // ── getItem ──
      const [item] = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.id, itemId),
            eq(catalogItems.tenantId, tenantId),
            isNull(catalogItems.archivedAt),
          ),
        )
        .limit(1);

      if (!item) return null;

      // ── parallel: effectivePrice + taxInfo + subDepartment (same tx) ──
      const [price, taxInfo, subDepartmentId] = await Promise.all([
        // getEffectivePrice
        (async () => {
          const [override] = await tx
            .select()
            .from(catalogLocationPrices)
            .where(
              and(
                eq(catalogLocationPrices.catalogItemId, itemId),
                eq(catalogLocationPrices.locationId, locationId),
                eq(catalogLocationPrices.tenantId, tenantId),
              ),
            )
            .limit(1);
          if (override) return Number(override.price);
          return Number(item.defaultPrice);
        })(),
        // getItemTaxes
        (async (): Promise<ItemTaxInfo> => {
          const assignments = await tx
            .select({ taxGroupId: catalogItemLocationTaxGroups.taxGroupId })
            .from(catalogItemLocationTaxGroups)
            .where(
              and(
                eq(catalogItemLocationTaxGroups.tenantId, tenantId),
                eq(catalogItemLocationTaxGroups.locationId, locationId),
                eq(catalogItemLocationTaxGroups.catalogItemId, itemId),
              ),
            );

          const defaultMode = 'exclusive' as const;
          if (assignments.length === 0) {
            return { calculationMode: defaultMode, taxGroups: [], taxRates: [], totalRate: 0 };
          }

          const groupIds = assignments.map((a) => a.taxGroupId);
          const groups = await tx
            .select()
            .from(taxGroups)
            .where(
              and(
                eq(taxGroups.tenantId, tenantId),
                eq(taxGroups.isActive, true),
                inArray(taxGroups.id, groupIds),
              ),
            );

          if (groups.length === 0) {
            return { calculationMode: defaultMode, taxGroups: [], taxRates: [], totalRate: 0 };
          }

          const activeGroupIds = groups.map((g) => g.id);
          const groupRateRows = await tx
            .select({
              taxRateId: taxGroupRates.taxRateId,
              sortOrder: taxGroupRates.sortOrder,
            })
            .from(taxGroupRates)
            .where(inArray(taxGroupRates.taxGroupId, activeGroupIds))
            .orderBy(asc(taxGroupRates.sortOrder));

          if (groupRateRows.length === 0) {
            return {
              calculationMode: defaultMode,
              taxGroups: groups.map((g) => ({ id: g.id, name: g.name })),
              taxRates: [],
              totalRate: 0,
            };
          }

          const rateIds = [...new Set(groupRateRows.map((r) => r.taxRateId))];
          const rateRows = await tx
            .select()
            .from(taxRates)
            .where(and(inArray(taxRates.id, rateIds), eq(taxRates.isActive, true)));

          const uniqueRates = new Map<string, { id: string; name: string; rateDecimal: number }>();
          for (const r of rateRows) {
            if (!uniqueRates.has(r.id)) {
              uniqueRates.set(r.id, { id: r.id, name: r.name, rateDecimal: Number(r.rateDecimal) });
            }
          }

          const taxRatesList = Array.from(uniqueRates.values());
          const totalRate = taxRatesList.reduce((sum, r) => sum + r.rateDecimal, 0);
          return {
            calculationMode: defaultMode,
            taxGroups: groups.map((g) => ({ id: g.id, name: g.name })),
            taxRates: taxRatesList,
            totalRate,
          };
        })(),
        // getSubDepartmentForItem
        (async () => {
          const rows = await tx.execute(sql`
            SELECT COALESCE(cat.parent_id, cat.id) AS sub_department_id
            FROM catalog_items ci
            JOIN catalog_categories cat ON cat.id = ci.category_id
            WHERE ci.id = ${itemId}
              AND ci.tenant_id = ${tenantId}
            LIMIT 1
          `);
          const arr = Array.from(rows as Iterable<Record<string, unknown>>);
          return arr.length > 0 ? (arr[0]!.sub_department_id as string) : null;
        })(),
      ]);

      const unitPriceCents = Math.round(price * 100);
      if (!Number.isFinite(unitPriceCents)) {
        console.error(`[getItemForPOS] Non-finite price for item ${itemId} (${item.name}, ${item.itemType}): rawPrice=${price}, cents=${unitPriceCents}`);
      }

      return {
        id: item.id,
        sku: item.sku,
        barcode: item.barcode,
        name: item.name,
        itemType: item.itemType,
        isTrackable: item.isTrackable,
        unitPriceCents: Number.isFinite(unitPriceCents) ? unitPriceCents : 0,
        taxInfo: {
          ...taxInfo,
          calculationMode: item.priceIncludesTax ? 'inclusive' as const : 'exclusive' as const,
        },
        metadata: item.metadata ?? null,
        categoryId: item.categoryId ?? null,
        subDepartmentId,
      };
    });
  }

  async getItemsForPOS(
    tenantId: string,
    locationId: string,
    itemIds: string[],
  ): Promise<Map<string, PosItemData>> {
    if (itemIds.length === 0) return new Map();

    const uniqueIds = [...new Set(itemIds)];

    return withTenant(tenantId, async (tx) => {
      const items = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            inArray(catalogItems.id, uniqueIds),
            eq(catalogItems.tenantId, tenantId),
            isNull(catalogItems.archivedAt),
          ),
        );

      if (items.length === 0) return new Map();

      const foundIds = items.map((i) => i.id);

      const [priceOverrides, taxAssignments, subDeptRows] = await Promise.all([
        tx
          .select()
          .from(catalogLocationPrices)
          .where(
            and(
              inArray(catalogLocationPrices.catalogItemId, foundIds),
              eq(catalogLocationPrices.locationId, locationId),
              eq(catalogLocationPrices.tenantId, tenantId),
            ),
          ),
        tx
          .select({
            catalogItemId: catalogItemLocationTaxGroups.catalogItemId,
            taxGroupId: catalogItemLocationTaxGroups.taxGroupId,
          })
          .from(catalogItemLocationTaxGroups)
          .where(
            and(
              eq(catalogItemLocationTaxGroups.tenantId, tenantId),
              eq(catalogItemLocationTaxGroups.locationId, locationId),
              inArray(catalogItemLocationTaxGroups.catalogItemId, foundIds),
            ),
          ),
        tx.execute(sql`
          SELECT ci.id AS item_id, COALESCE(cat.parent_id, cat.id) AS sub_department_id
          FROM catalog_items ci
          JOIN catalog_categories cat ON cat.id = ci.category_id
          WHERE ci.id = ANY(${sqlArray(foundIds)})
            AND ci.tenant_id = ${tenantId}
        `),
      ]);

      const priceMap = new Map<string, number>();
      for (const row of priceOverrides) {
        priceMap.set(row.catalogItemId, Number(row.price));
      }

      const subDeptMap = new Map<string, string>();
      for (const row of Array.from(subDeptRows as Iterable<Record<string, unknown>>)) {
        subDeptMap.set(row.item_id as string, row.sub_department_id as string);
      }

      const allGroupIds = [...new Set(taxAssignments.map((a) => a.taxGroupId))];
      const taxGroupsMap = new Map<string, { id: string; name: string }>();
      const taxRatesByGroup = new Map<string, Array<{ id: string; name: string; rateDecimal: number }>>();

      if (allGroupIds.length > 0) {
        const [groups, groupRateRows] = await Promise.all([
          tx
            .select()
            .from(taxGroups)
            .where(
              and(
                eq(taxGroups.tenantId, tenantId),
                eq(taxGroups.isActive, true),
                inArray(taxGroups.id, allGroupIds),
              ),
            ),
          tx
            .select({
              taxGroupId: taxGroupRates.taxGroupId,
              taxRateId: taxGroupRates.taxRateId,
              sortOrder: taxGroupRates.sortOrder,
            })
            .from(taxGroupRates)
            .where(inArray(taxGroupRates.taxGroupId, allGroupIds))
            .orderBy(asc(taxGroupRates.sortOrder)),
        ]);

        for (const g of groups) {
          taxGroupsMap.set(g.id, { id: g.id, name: g.name });
        }

        const allRateIds = [...new Set(groupRateRows.map((r) => r.taxRateId))];
        if (allRateIds.length > 0) {
          const rateRows = await tx
            .select()
            .from(taxRates)
            .where(and(inArray(taxRates.id, allRateIds), eq(taxRates.isActive, true)));

          const rateMap = new Map<string, { id: string; name: string; rateDecimal: number }>();
          for (const r of rateRows) {
            rateMap.set(r.id, { id: r.id, name: r.name, rateDecimal: Number(r.rateDecimal) });
          }

          for (const gr of groupRateRows) {
            const rate = rateMap.get(gr.taxRateId);
            if (!rate) continue;
            const existing = taxRatesByGroup.get(gr.taxGroupId) ?? [];
            if (!existing.some((e) => e.id === rate.id)) {
              existing.push(rate);
            }
            taxRatesByGroup.set(gr.taxGroupId, existing);
          }
        }
      }

      const itemTaxGroupIds = new Map<string, string[]>();
      for (const a of taxAssignments) {
        const existing = itemTaxGroupIds.get(a.catalogItemId) ?? [];
        existing.push(a.taxGroupId);
        itemTaxGroupIds.set(a.catalogItemId, existing);
      }

      const result = new Map<string, PosItemData>();
      for (const item of items) {
        const overridePrice = priceMap.get(item.id);
        const price = overridePrice ?? Number(item.defaultPrice);
        const unitPriceCents = Math.round(price * 100);

        const itemGroupIds = itemTaxGroupIds.get(item.id) ?? [];
        const activeGroups = itemGroupIds
          .map((gId) => taxGroupsMap.get(gId))
          .filter((g): g is { id: string; name: string } => g !== undefined);

        const uniqueRates = new Map<string, { id: string; name: string; rateDecimal: number }>();
        for (const gId of itemGroupIds) {
          const rates = taxRatesByGroup.get(gId) ?? [];
          for (const r of rates) {
            if (!uniqueRates.has(r.id)) uniqueRates.set(r.id, r);
          }
        }
        const taxRatesList = Array.from(uniqueRates.values());
        const totalRate = taxRatesList.reduce((sum, r) => sum + r.rateDecimal, 0);

        const taxInfo: ItemTaxInfo = {
          calculationMode: item.priceIncludesTax ? 'inclusive' : 'exclusive',
          taxGroups: activeGroups,
          taxRates: taxRatesList,
          totalRate,
        };

        if (!Number.isFinite(unitPriceCents)) {
          console.error(`[getItemsForPOS] Non-finite price for item ${item.id} (${item.name}, ${item.itemType}): rawPrice=${price}, cents=${unitPriceCents}`);
        }

        result.set(item.id, {
          id: item.id,
          sku: item.sku,
          barcode: item.barcode,
          name: item.name,
          itemType: item.itemType,
          isTrackable: item.isTrackable,
          unitPriceCents: Number.isFinite(unitPriceCents) ? unitPriceCents : 0,
          taxInfo,
          metadata: item.metadata ?? null,
          categoryId: item.categoryId ?? null,
          subDepartmentId: subDeptMap.get(item.id) ?? null,
        });
      }

      return result;
    });
  }

  async getItemTaxes(
    tenantId: string,
    locationId: string,
    itemId: string,
  ): Promise<ItemTaxInfo> {
    return withTenant(tenantId, async (tx) => {
      // 1. Find tax group assignments for this item at this location
      const assignments = await tx
        .select({ taxGroupId: catalogItemLocationTaxGroups.taxGroupId })
        .from(catalogItemLocationTaxGroups)
        .where(
          and(
            eq(catalogItemLocationTaxGroups.tenantId, tenantId),
            eq(catalogItemLocationTaxGroups.locationId, locationId),
            eq(catalogItemLocationTaxGroups.catalogItemId, itemId),
          ),
        );

      if (assignments.length === 0) {
        return { calculationMode: 'exclusive' as const, taxGroups: [], taxRates: [], totalRate: 0 };
      }

      const groupIds = assignments.map((a) => a.taxGroupId);

      // 2. Load tax groups
      const groups = await tx
        .select()
        .from(taxGroups)
        .where(
          and(
            eq(taxGroups.tenantId, tenantId),
            eq(taxGroups.isActive, true),
            inArray(taxGroups.id, groupIds),
          ),
        );

      if (groups.length === 0) {
        return { calculationMode: 'exclusive' as const, taxGroups: [], taxRates: [], totalRate: 0 };
      }

      // calculationMode is now derived from item.priceIncludesTax by the caller (getItemForPOS).
      // This method returns a default that gets overridden.
      const defaultMode = 'exclusive' as const;

      // 4. Load all tax rates from these groups via tax_group_rates
      const activeGroupIds = groups.map((g) => g.id);
      const groupRateRows = await tx
        .select({
          taxRateId: taxGroupRates.taxRateId,
          sortOrder: taxGroupRates.sortOrder,
        })
        .from(taxGroupRates)
        .where(inArray(taxGroupRates.taxGroupId, activeGroupIds))
        .orderBy(asc(taxGroupRates.sortOrder));

      if (groupRateRows.length === 0) {
        return {
          calculationMode: defaultMode,
          taxGroups: groups.map((g) => ({ id: g.id, name: g.name })),
          taxRates: [],
          totalRate: 0,
        };
      }

      const rateIds = [...new Set(groupRateRows.map((r) => r.taxRateId))];

      const rateRows = await tx
        .select()
        .from(taxRates)
        .where(and(inArray(taxRates.id, rateIds), eq(taxRates.isActive, true)));

      // 5. Deduplicate rates
      const uniqueRates = new Map<string, { id: string; name: string; rateDecimal: number }>();
      for (const r of rateRows) {
        if (!uniqueRates.has(r.id)) {
          uniqueRates.set(r.id, {
            id: r.id,
            name: r.name,
            rateDecimal: Number(r.rateDecimal),
          });
        }
      }

      const taxRatesList = Array.from(uniqueRates.values());
      const totalRate = taxRatesList.reduce((sum, r) => sum + r.rateDecimal, 0);

      return {
        calculationMode: defaultMode,
        taxGroups: groups.map((g) => ({ id: g.id, name: g.name })),
        taxRates: taxRatesList,
        totalRate,
      };
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────

export function createDrizzleCatalogReadApi(): CatalogReadApi {
  return new DrizzleCatalogReadApi();
}

