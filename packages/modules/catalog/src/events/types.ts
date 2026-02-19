import { z } from 'zod';

export const CatalogItemCreatedDataSchema = z.object({
  itemId: z.string(),
  sku: z.string().nullable(),
  name: z.string(),
  itemType: z.string(),
  defaultPrice: z.number(),
  cost: z.number().nullable(),
  categoryId: z.string().nullable(),
  taxCategoryId: z.string().nullable(),
  isTrackable: z.boolean(),
});

export const CatalogItemUpdatedDataSchema = z.object({
  itemId: z.string(),
  changes: z.record(
    z.object({
      old: z.unknown(),
      new: z.unknown(),
    }),
  ),
});

export const CatalogItemArchivedDataSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  reason: z.string().nullable().optional(),
});

export const CatalogItemUnarchivedDataSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
});

export const CatalogCategoryCreatedDataSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
});

export const CatalogTaxCategoryCreatedDataSchema = z.object({
  taxCategoryId: z.string(),
  name: z.string(),
  rate: z.number(),
});

export const CatalogModifierGroupCreatedDataSchema = z.object({
  modifierGroupId: z.string(),
  name: z.string(),
  selectionType: z.string(),
  modifierCount: z.number(),
});

export const CatalogLocationPriceSetDataSchema = z.object({
  catalogItemId: z.string(),
  locationId: z.string(),
  price: z.number(),
  previousPrice: z.number().nullable(),
});

// ── Tax System Events ──────────────────────────────────────────

export const TaxRateCreatedDataSchema = z.object({
  taxRateId: z.string(),
  name: z.string(),
  rateDecimal: z.number(),
});

export const TaxRateUpdatedDataSchema = z.object({
  taxRateId: z.string(),
  changes: z.record(z.object({ old: z.unknown(), new: z.unknown() })),
});

export const TaxGroupCreatedDataSchema = z.object({
  taxGroupId: z.string(),
  locationId: z.string(),
  name: z.string(),
  taxRateIds: z.array(z.string()),
});

export const TaxGroupUpdatedDataSchema = z.object({
  taxGroupId: z.string(),
  changes: z.record(z.object({ old: z.unknown(), new: z.unknown() })),
});

export const CatalogItemTaxGroupsUpdatedDataSchema = z.object({
  catalogItemId: z.string(),
  locationId: z.string(),
  taxGroupIds: z.array(z.string()),
});
