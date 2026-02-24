import { z } from 'zod';

// ── Enums ─────────────────────────────────────────────────────────────

export const IMPORT_STATUSES = [
  'analyzing',
  'mapping',
  'validating',
  'ready',
  'importing',
  'completed',
  'failed',
  'cancelled',
] as const;

export const IMPORT_MODES = ['operational', 'financial'] as const;

export const TARGET_ENTITIES = ['order', 'line', 'tender', 'tax', 'ignore'] as const;

export const DATA_TYPES = ['string', 'number', 'date', 'currency', 'boolean'] as const;

export const TRANSFORM_RULES = [
  'none',
  'cents_to_dollars',
  'dollars_to_cents',
  'date_parse',
  'lookup',
] as const;

export const TENDER_TYPES = [
  'cash',
  'card',
  'gift_card',
  'house_account',
  'check',
  'online',
  'other',
] as const;

export const TAX_MODES = ['inclusive', 'exclusive'] as const;

export const ITEM_STRATEGIES = ['auto', 'mapped', 'placeholder', 'skip'] as const;

export const ERROR_SEVERITIES = ['error', 'warning', 'info'] as const;

export const ERROR_CATEGORIES = [
  'mapping',
  'validation',
  'balance',
  'duplicate',
  'missing_item',
  'missing_tender',
  'date_invalid',
  'negative_amount',
] as const;

export const STAGED_ROW_STATUSES = ['pending', 'imported', 'skipped', 'error'] as const;

export const ENTITY_TYPES = ['order_header', 'order_line', 'tender'] as const;

// ── Create Import Job ─────────────────────────────────────────────────

export const createImportJobSchema = z.object({
  name: z.string().min(1).max(200),
  csvContent: z.string().min(1),
  fileName: z.string().min(1).max(500),
  fileSizeBytes: z.number().int().positive(),
  mode: z.enum(IMPORT_MODES).default('operational'),
  sourceSystem: z.string().max(100).optional(),
  locationId: z.string().min(1).optional(),
});

export type CreateImportJobInput = z.input<typeof createImportJobSchema>;

// ── Update Column Mappings ────────────────────────────────────────────

export const columnMappingUpdateSchema = z.object({
  id: z.string().min(1),
  targetEntity: z.enum(TARGET_ENTITIES),
  targetField: z.string().min(1).max(100),
  isConfirmed: z.boolean().default(true),
  transformRule: z.enum(TRANSFORM_RULES).optional(),
});

export const updateColumnMappingsSchema = z.object({
  importJobId: z.string().min(1),
  mappings: z.array(columnMappingUpdateSchema).min(1),
  groupingKey: z.string().min(1).optional(),
});

export type UpdateColumnMappingsInput = z.input<typeof updateColumnMappingsSchema>;

// ── Update Tender Mappings ────────────────────────────────────────────

export const tenderMappingUpdateSchema = z.object({
  id: z.string().min(1),
  oppseraTenderType: z.enum(TENDER_TYPES),
  isConfirmed: z.boolean().default(true),
});

export const updateTenderMappingsSchema = z.object({
  importJobId: z.string().min(1),
  mappings: z.array(tenderMappingUpdateSchema).min(1),
});

export type UpdateTenderMappingsInput = z.input<typeof updateTenderMappingsSchema>;

// ── Update Tax Mappings ───────────────────────────────────────────────

export const taxMappingUpdateSchema = z.object({
  id: z.string().min(1),
  oppseraTaxGroupId: z.string().min(1).optional(),
  taxMode: z.enum(TAX_MODES).default('exclusive'),
  isConfirmed: z.boolean().default(true),
});

export const updateTaxMappingsSchema = z.object({
  importJobId: z.string().min(1),
  mappings: z.array(taxMappingUpdateSchema).min(1),
});

export type UpdateTaxMappingsInput = z.input<typeof updateTaxMappingsSchema>;

// ── Update Item Mappings ──────────────────────────────────────────────

export const itemMappingUpdateSchema = z.object({
  id: z.string().min(1),
  oppseraCatalogItemId: z.string().min(1).optional(),
  strategy: z.enum(ITEM_STRATEGIES).default('auto'),
  isConfirmed: z.boolean().default(true),
});

export const updateItemMappingsSchema = z.object({
  importJobId: z.string().min(1),
  mappings: z.array(itemMappingUpdateSchema).min(1),
});

export type UpdateItemMappingsInput = z.input<typeof updateItemMappingsSchema>;

// ── Validate Import ───────────────────────────────────────────────────

export const validateImportSchema = z.object({
  importJobId: z.string().min(1),
});

export type ValidateImportInput = z.infer<typeof validateImportSchema>;

// ── Execute Import ────────────────────────────────────────────────────

export const executeImportSchema = z.object({
  importJobId: z.string().min(1),
  acknowledgeWarnings: z.boolean().default(false),
});

export type ExecuteImportInput = z.input<typeof executeImportSchema>;

// ── Cancel Import ─────────────────────────────────────────────────────

export const cancelImportSchema = z.object({
  importJobId: z.string().min(1),
});

export type CancelImportInput = z.infer<typeof cancelImportSchema>;

// ── Query Schemas ─────────────────────────────────────────────────────

export const listImportJobsSchema = z.object({
  tenantId: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  status: z.enum(IMPORT_STATUSES).optional(),
});

export type ListImportJobsInput = z.input<typeof listImportJobsSchema>;

export const getImportJobSchema = z.object({
  tenantId: z.string().min(1),
  importJobId: z.string().min(1),
});

export type GetImportJobInput = z.infer<typeof getImportJobSchema>;

export const getImportErrorsSchema = z.object({
  tenantId: z.string().min(1),
  importJobId: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  severity: z.enum(ERROR_SEVERITIES).optional(),
});

export type GetImportErrorsInput = z.input<typeof getImportErrorsSchema>;

export const getImportProgressSchema = z.object({
  tenantId: z.string().min(1),
  importJobId: z.string().min(1),
});

export type GetImportProgressInput = z.infer<typeof getImportProgressSchema>;
