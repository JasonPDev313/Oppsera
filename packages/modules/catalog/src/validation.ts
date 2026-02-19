import { z } from 'zod';

// === Tax Category ===

export const createTaxCategorySchema = z.object({
  name: z.string().min(1).max(100).transform((v) => v.trim()),
  rate: z.number().min(0).max(1).multipleOf(0.0001),
});
export type CreateTaxCategoryInput = z.infer<typeof createTaxCategorySchema>;

export const updateTaxCategorySchema = z.object({
  name: z.string().min(1).max(100).transform((v) => v.trim()).optional(),
  rate: z.number().min(0).max(1).multipleOf(0.0001).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTaxCategoryInput = z.infer<typeof updateTaxCategorySchema>;

// === Category ===

export const createCategorySchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  parentId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// === Item ===

export const createItemSchema = z.object({
  sku: z
    .string()
    .min(1)
    .max(50)
    .transform((v) => v.trim().toUpperCase())
    .optional(),
  barcode: z.string().min(1).max(100).trim().optional(),
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  description: z.string().max(1000).optional(),
  itemType: z.enum(['retail', 'food', 'beverage', 'service', 'green_fee', 'rental']),
  defaultPrice: z.number().positive().multipleOf(0.01),
  cost: z.number().nonnegative().multipleOf(0.01).optional(),
  categoryId: z.string().min(1).optional(),
  taxCategoryId: z.string().min(1).optional(),
  priceIncludesTax: z.boolean().default(false),
  isTrackable: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
  modifierGroupIds: z.array(z.string().min(1)).optional().default([]),
  defaultModifierGroupIds: z.array(z.string().min(1)).optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z.object({
  sku: z
    .string()
    .min(1)
    .max(50)
    .transform((v) => v.trim().toUpperCase())
    .optional(),
  barcode: z.string().min(1).max(100).trim().nullable().optional(),
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  description: z.string().max(1000).nullable().optional(),
  itemType: z
    .enum(['retail', 'food', 'beverage', 'service', 'green_fee', 'rental'])
    .optional(),
  defaultPrice: z.number().positive().multipleOf(0.01).optional(),
  cost: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  taxCategoryId: z.string().min(1).nullable().optional(),
  priceIncludesTax: z.boolean().optional(),
  isTrackable: z.boolean().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  modifierGroupIds: z.array(z.string().min(1)).optional(),
  defaultModifierGroupIds: z.array(z.string().min(1)).optional(),
});
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// === Modifier Group ===

export const createModifierGroupSchema = z
  .object({
    name: z.string().min(1).max(200).transform((v) => v.trim()),
    selectionType: z.enum(['single', 'multiple']).default('single'),
    isRequired: z.boolean().default(false),
    minSelections: z.number().int().min(0).default(0),
    maxSelections: z.number().int().min(1).nullable().optional(),
    modifiers: z
      .array(
        z.object({
          name: z.string().min(1).max(200).transform((v) => v.trim()),
          priceAdjustment: z.number().multipleOf(0.01).default(0),
          sortOrder: z.number().int().min(0).default(0),
        }),
      )
      .min(1),
  })
  .refine(
    (data) => {
      if (data.isRequired && data.minSelections < 1) return false;
      if (
        data.maxSelections !== null &&
        data.maxSelections !== undefined &&
        data.minSelections > data.maxSelections
      )
        return false;
      return true;
    },
    { message: 'Invalid selection constraints' },
  );
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;

export const updateModifierGroupSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  selectionType: z.enum(['single', 'multiple']).optional(),
  isRequired: z.boolean().optional(),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).nullable().optional(),
  modifiers: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        name: z.string().min(1).max(200).transform((v) => v.trim()),
        priceAdjustment: z.number().multipleOf(0.01).default(0),
        sortOrder: z.number().int().min(0).default(0),
        isActive: z.boolean().default(true),
      }),
    )
    .optional(),
});
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;

// === Location Price ===

export const setLocationPriceSchema = z.object({
  catalogItemId: z.string().min(1),
  locationId: z.string().min(1),
  price: z.number().positive().multipleOf(0.01),
});
export type SetLocationPriceInput = z.infer<typeof setLocationPriceSchema>;

export const removeLocationPriceSchema = z.object({
  catalogItemId: z.string().min(1),
  locationId: z.string().min(1),
});
export type RemoveLocationPriceInput = z.infer<typeof removeLocationPriceSchema>;

// === Archive ===

export const archiveItemSchema = z.object({
  reason: z.string().max(500).transform((v) => v.trim()).optional(),
});
export type ArchiveItemInput = z.input<typeof archiveItemSchema>;
