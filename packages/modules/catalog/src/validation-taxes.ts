import { z } from 'zod';

// --- Tax Rates ---
const AUTHORITY_TYPES = ['state', 'county', 'city', 'district'] as const;
const TAX_TYPES = ['sales', 'excise', 'hospitality', 'use'] as const;
const FILING_FREQUENCIES = ['monthly', 'quarterly', 'annual'] as const;

export const createTaxRateSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  rateDecimal: z.number().min(0).max(1).transform((v) => Number(v.toFixed(4))),
  jurisdictionCode: z.string().max(50).optional(),
  authorityName: z.string().max(200).optional(),
  authorityType: z.enum(AUTHORITY_TYPES).optional(),
  taxType: z.enum(TAX_TYPES).optional().default('sales'),
  filingFrequency: z.enum(FILING_FREQUENCIES).optional(),
});
export type CreateTaxRateInput = z.input<typeof createTaxRateSchema>;

export const updateTaxRateSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  rateDecimal: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  jurisdictionCode: z.string().max(50).nullable().optional(),
  authorityName: z.string().max(200).nullable().optional(),
  authorityType: z.enum(AUTHORITY_TYPES).nullable().optional(),
  taxType: z.enum(TAX_TYPES).optional(),
  filingFrequency: z.enum(FILING_FREQUENCIES).nullable().optional(),
});
export type UpdateTaxRateInput = z.input<typeof updateTaxRateSchema>;

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
