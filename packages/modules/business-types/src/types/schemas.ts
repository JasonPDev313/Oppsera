import { z } from 'zod';

// ── Accounting Template Sub-Schemas ─────────────────────────────

export const RevenueCategorySchema = z.object({
  serviceRevenue: z.string().optional(),
  retailRevenue: z.string().optional(),
  foodRevenue: z.string().optional(),
  beverageRevenue: z.string().optional(),
});

export const PaymentGlMappingSchema = z.object({
  cash: z.string().optional(),
  creditCard: z.string().optional(),
  giftCard: z.string().optional(),
  memberCharge: z.string().optional(),
});

export const TaxBehaviorSchema = z.object({
  defaultTaxInclusive: z.boolean().default(false),
  separateTaxLiability: z.boolean().default(true),
});

export const DeferredRevenueSchema = z.object({
  enabled: z.boolean().default(false),
  liabilityAccount: z.string().optional(),
});

export const FiscalSettingsSchema = z.object({
  fiscalYearStart: z.string().optional(), // MM-DD
  reportingCurrency: z.string().default('USD'),
});

// ── Main Schemas ────────────────────────────────────────────────

export const BusinessCategorySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().nullable().optional(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
});

export const CreateBusinessTypeInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  categoryId: z.string().min(1),
  description: z.string().max(500).optional(),
  iconKey: z.string().max(50).optional(),
  isActive: z.boolean().default(true),
  showAtSignup: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const UpdateBusinessTypeMetadataInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  iconKey: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  showAtSignup: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  categoryId: z.string().min(1).optional(),
});

export const ModuleDefaultInputSchema = z.object({
  moduleKey: z.string().min(1),
  isEnabled: z.boolean(),
  accessMode: z.enum(['off', 'view', 'full']).default('full'),
  sortOrder: z.number().int().default(0),
});

export const SaveModuleDefaultsInputSchema = z.object({
  modules: z.array(ModuleDefaultInputSchema),
});

export const AccountingTemplateInputSchema = z.object({
  coaTemplateRef: z.string().nullable().optional(),
  revenueCategories: RevenueCategorySchema.default({}),
  paymentGlMappings: PaymentGlMappingSchema.default({}),
  taxBehavior: TaxBehaviorSchema.default({}),
  deferredRevenue: DeferredRevenueSchema.default({}),
  cogsBehavior: z.enum(['disabled', 'perpetual', 'periodic']).default('disabled'),
  fiscalSettings: FiscalSettingsSchema.default({}),
});

export const RoleTemplateInputSchema = z.object({
  roleName: z.string().min(1).max(100),
  roleKey: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, 'Role key must be lowercase alphanumeric with underscores'),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  permissions: z.array(z.string()).default([]),
});

export const PublishVersionInputSchema = z.object({
  changeSummary: z.string().min(1).max(1000),
});

// ── Inferred Types ──────────────────────────────────────────────

export type CreateBusinessTypeInput = z.infer<typeof CreateBusinessTypeInputSchema>;
export type UpdateBusinessTypeMetadataInput = z.infer<typeof UpdateBusinessTypeMetadataInputSchema>;
export type ModuleDefaultInput = z.infer<typeof ModuleDefaultInputSchema>;
export type AccountingTemplateInput = z.infer<typeof AccountingTemplateInputSchema>;
export type RoleTemplateInput = z.infer<typeof RoleTemplateInputSchema>;
export type PublishVersionInput = z.infer<typeof PublishVersionInputSchema>;
export type RevenueCategory = z.infer<typeof RevenueCategorySchema>;
export type PaymentGlMapping = z.infer<typeof PaymentGlMappingSchema>;
export type TaxBehavior = z.infer<typeof TaxBehaviorSchema>;
export type FiscalSettings = z.infer<typeof FiscalSettingsSchema>;
