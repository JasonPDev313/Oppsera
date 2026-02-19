import { z } from 'zod';

// --- Tax Rates ---
export const createTaxRateSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  rateDecimal: z.number().min(0).max(1).refine(
    (v) => Number(v.toFixed(4)) === v,
    { message: 'Rate must have at most 4 decimal places' },
  ),
});
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;

export const updateTaxRateSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  rateDecimal: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;

// --- Tax Groups ---
export const createTaxGroupSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  taxRateIds: z.array(z.string().min(1)).min(1),
});
export type CreateTaxGroupInput = z.infer<typeof createTaxGroupSchema>;

export const updateTaxGroupSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTaxGroupInput = z.infer<typeof updateTaxGroupSchema>;

// --- Add/Remove rates from a group ---
export const addTaxRateToGroupSchema = z.object({
  taxGroupId: z.string().min(1),
  taxRateId: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});
export type AddTaxRateToGroupInput = z.infer<typeof addTaxRateToGroupSchema>;

export const removeTaxRateFromGroupSchema = z.object({
  taxGroupId: z.string().min(1),
  taxRateId: z.string().min(1),
});
export type RemoveTaxRateFromGroupInput = z.infer<typeof removeTaxRateFromGroupSchema>;

// --- Assign tax groups to an item at a location ---
export const assignItemTaxGroupsSchema = z.object({
  locationId: z.string().min(1),
  catalogItemId: z.string().min(1),
  taxGroupIds: z.array(z.string().min(1)),
});
export type AssignItemTaxGroupsInput = z.infer<typeof assignItemTaxGroupsSchema>;
