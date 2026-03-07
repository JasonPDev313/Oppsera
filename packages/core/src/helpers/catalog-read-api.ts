// ── Shared Reference Types ───────────────────────────────────────

export interface TaxGroupRef {
  readonly id: string;
  readonly name: string;
}

export interface TaxRateRef {
  readonly id: string;
  readonly name: string;
  readonly rateDecimal: number;
}

// ── Item Tax Info ────────────────────────────────────────────────

export interface ItemTaxInfo {
  readonly calculationMode: 'exclusive' | 'inclusive';
  readonly taxGroups: TaxGroupRef[];
  readonly taxRates: TaxRateRef[];
  readonly totalRate: number;
}

// ── POS Item Data ────────────────────────────────────────────────

export interface PosItemData {
  readonly id: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly name: string;
  readonly itemType: string;
  readonly isTrackable: boolean;
  /** Price in cents (integer). Always finite; defaults to 0 on bad input. */
  readonly unitPriceCents: number;
  readonly taxInfo: ItemTaxInfo;
  readonly metadata: Record<string, unknown> | null;
  readonly categoryId: string | null;
  readonly subDepartmentId: string | null;
}

// ── Lightweight Catalog Item (no Drizzle dependency) ─────────────

export interface CatalogItemRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly categoryId: string | null;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly itemType: string;
  readonly defaultPrice: string;
  readonly cost: string | null;
  readonly taxCategoryId: string | null;
  readonly priceIncludesTax: boolean;
  readonly isTrackable: boolean;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archivedReason: string | null;
}

export interface ModifierRecord {
  readonly id: string;
  readonly name: string;
  readonly modifierGroupId: string;
  readonly priceAdjustment: string;
  readonly isActive: boolean;
}

export interface ModifierGroupRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly minSelections: number;
  readonly maxSelections: number | null;
}

export interface ModifierGroupWithModifiers extends ModifierGroupRecord {
  readonly modifiers: ModifierRecord[];
}

export interface CatalogItemWithModifiers extends CatalogItemRecord {
  readonly modifierGroups: ModifierGroupWithModifiers[];
}

// ── Interface ────────────────────────────────────────────────────

export interface CatalogReadApi {
  getItem(tenantId: string, itemId: string): Promise<CatalogItemRecord | null>;

  getEffectivePrice(
    tenantId: string,
    itemId: string,
    locationId: string,
  ): Promise<number>;

  getItemsWithModifiers(
    tenantId: string,
    itemIds: string[],
  ): Promise<CatalogItemWithModifiers[]>;

  getItemTaxes(
    tenantId: string,
    locationId: string,
    itemId: string,
  ): Promise<ItemTaxInfo>;

  getItemForPOS(
    tenantId: string,
    locationId: string,
    itemId: string,
  ): Promise<PosItemData | null>;

  getItemsForPOS(
    tenantId: string,
    locationId: string,
    itemIds: string[],
  ): Promise<Map<string, PosItemData>>;

  getSubDepartmentForItem(
    tenantId: string,
    itemId: string,
  ): Promise<string | null>;

  getAssignedModifierGroupIds(
    tenantId: string,
    catalogItemIds: string[],
  ): Promise<Map<string, string[]>>;
}

// ── Singleton (implementation injected by catalog module via registerCatalogReadApi) ──

const GLOBAL_KEY = '__oppsera_catalog_read_api__' as const;

export function getCatalogReadApi(): CatalogReadApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CatalogReadApi | undefined;
  if (!api) {
    throw new Error(
      'CatalogReadApi not registered. Ensure registerCatalogReadApi() is called during startup (instrumentation.ts).',
    );
  }
  return api;
}

export function setCatalogReadApi(api: CatalogReadApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}
