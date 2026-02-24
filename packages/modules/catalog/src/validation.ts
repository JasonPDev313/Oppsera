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

// === Modifier Group Category ===

export const instructionModeEnum = z.enum(['none', 'all', 'per_option']);
export const defaultBehaviorEnum = z.enum(['none', 'auto_select_defaults']);
export const channelEnum = z.enum(['pos', 'online', 'qr', 'kiosk']);

export const createModifierGroupCategorySchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  parentId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateModifierGroupCategoryInput = z.input<typeof createModifierGroupCategorySchema>;

export const updateModifierGroupCategorySchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateModifierGroupCategoryInput = z.input<typeof updateModifierGroupCategorySchema>;

// === Modifier Group ===

const modifierOptionSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  priceAdjustment: z.number().multipleOf(0.01).default(0),
  extraPriceDelta: z.number().multipleOf(0.01).nullable().optional(),
  kitchenLabel: z.string().max(100).transform((v) => v.trim()).nullable().optional(),
  allowNone: z.boolean().default(true),
  allowExtra: z.boolean().default(true),
  allowOnSide: z.boolean().default(true),
  isDefaultOption: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const createModifierGroupSchema = z
  .object({
    name: z.string().min(1).max(200).transform((v) => v.trim()),
    selectionType: z.enum(['single', 'multiple']).default('single'),
    isRequired: z.boolean().default(false),
    minSelections: z.number().int().min(0).default(0),
    maxSelections: z.number().int().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    instructionMode: instructionModeEnum.default('none'),
    defaultBehavior: defaultBehaviorEnum.default('none'),
    channelVisibility: z.array(channelEnum).default(['pos', 'online', 'qr', 'kiosk']),
    sortOrder: z.number().int().min(0).default(0),
    modifiers: z.array(modifierOptionSchema).min(1),
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
export type CreateModifierGroupInput = z.input<typeof createModifierGroupSchema>;

const updateModifierOptionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  priceAdjustment: z.number().multipleOf(0.01).default(0),
  extraPriceDelta: z.number().multipleOf(0.01).nullable().optional(),
  kitchenLabel: z.string().max(100).transform((v) => v.trim()).nullable().optional(),
  allowNone: z.boolean().default(true),
  allowExtra: z.boolean().default(true),
  allowOnSide: z.boolean().default(true),
  isDefaultOption: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateModifierGroupSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  selectionType: z.enum(['single', 'multiple']).optional(),
  isRequired: z.boolean().optional(),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  instructionMode: instructionModeEnum.optional(),
  defaultBehavior: defaultBehaviorEnum.optional(),
  channelVisibility: z.array(channelEnum).optional(),
  sortOrder: z.number().int().min(0).optional(),
  modifiers: z.array(updateModifierOptionSchema).optional(),
});
export type UpdateModifierGroupInput = z.input<typeof updateModifierGroupSchema>;

// === Bulk Modifier Assignment ===

export const bulkAssignModifierGroupsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(500),
  modifierGroupIds: z.array(z.string().min(1)).min(1).max(20),
  overrides: z.object({
    isDefault: z.boolean().default(false),
    overrideRequired: z.boolean().nullable().optional(),
    overrideMinSelections: z.number().int().min(0).nullable().optional(),
    overrideMaxSelections: z.number().int().min(1).nullable().optional(),
    overrideInstructionMode: instructionModeEnum.nullable().optional(),
    promptOrder: z.number().int().min(0).default(0),
  }).optional(),
  mode: z.enum(['merge', 'replace']).default('merge'),
});
export type BulkAssignModifierGroupsInput = z.input<typeof bulkAssignModifierGroupsSchema>;

export const updateItemModifierAssignmentSchema = z.object({
  isDefault: z.boolean().optional(),
  overrideRequired: z.boolean().nullable().optional(),
  overrideMinSelections: z.number().int().min(0).nullable().optional(),
  overrideMaxSelections: z.number().int().min(1).nullable().optional(),
  overrideInstructionMode: instructionModeEnum.nullable().optional(),
  promptOrder: z.number().int().min(0).optional(),
});
export type UpdateItemModifierAssignmentInput = z.input<typeof updateItemModifierAssignmentSchema>;

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
