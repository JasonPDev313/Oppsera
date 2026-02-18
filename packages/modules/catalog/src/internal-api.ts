import { eq, and, inArray, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
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
import type { CatalogItem, CatalogItemWithModifiers, ModifierGroupWithModifiers } from './types';
import type { CatalogReadApi, ItemTaxInfo, PosItemData } from '@oppsera/core/helpers/catalog-read-api';

// ── Implementation ──────────────────────────────────────────────

class DrizzleCatalogReadApi implements CatalogReadApi {
  async getItem(tenantId: string, itemId: string): Promise<CatalogItem | null> {
    return withTenant(tenantId, async (tx) => {
      const [item] = await tx
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.id, itemId),
            eq(catalogItems.tenantId, tenantId),
            eq(catalogItems.isActive, true),
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

  async getItemForPOS(
    tenantId: string,
    locationId: string,
    itemId: string,
  ): Promise<PosItemData | null> {
    const item = await this.getItem(tenantId, itemId);
    if (!item || !item.isActive) return null;

    const [price, taxInfo] = await Promise.all([
      this.getEffectivePrice(tenantId, itemId, locationId),
      this.getItemTaxes(tenantId, locationId, itemId),
    ]);

    return {
      id: item.id,
      sku: item.sku,
      barcode: item.barcode,
      name: item.name,
      itemType: item.itemType,
      isTrackable: item.isTrackable,
      unitPriceCents: Math.round(price * 100),
      taxInfo,
      metadata: item.metadata ?? null,
    };
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
        return { calculationMode: 'exclusive', taxGroups: [], taxRates: [], totalRate: 0 };
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
        return { calculationMode: 'exclusive', taxGroups: [], taxRates: [], totalRate: 0 };
      }

      // 3. V1 CONSTRAINT: All groups must share the same calculation mode
      const modes = new Set(groups.map((g) => g.calculationMode));
      if (modes.size > 1) {
        throw new AppError(
          'TAX_MODE_MISMATCH',
          `Item has tax groups with mixed calculation modes at location ${locationId}`,
          400,
        );
      }
      const calculationMode = groups[0]!.calculationMode as 'exclusive' | 'inclusive';

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
          calculationMode,
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
        calculationMode,
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

// ── Singleton ────────────────────────────────────────────────────

let _catalogReadApi: CatalogReadApi | null = null;

export function getCatalogReadApi(): CatalogReadApi {
  if (!_catalogReadApi) {
    _catalogReadApi = new DrizzleCatalogReadApi();
  }
  return _catalogReadApi;
}

export function setCatalogReadApi(api: CatalogReadApi): void {
  _catalogReadApi = api;
}
