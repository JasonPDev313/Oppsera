import { z } from 'zod';

// ── Analyze Import ──────────────────────────────────────────────────

export const analyzeImportSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  fileName: z.string().optional(),
});
export type AnalyzeImportInput = z.input<typeof analyzeImportSchema>;

// ── Validate Import ─────────────────────────────────────────────────

export const validateImportSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  mappings: z.record(z.string().nullable()),
  duplicateSkuMode: z.enum(['skip', 'update']).default('skip'),
  defaultItemType: z.enum(['retail', 'food', 'beverage', 'service', 'green_fee', 'rental']).default('retail'),
});
export type ValidateImportInput = z.input<typeof validateImportSchema>;

// ── Execute Import ──────────────────────────────────────────────────

export const executeImportSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  mappings: z.record(z.string().nullable()),
  duplicateSkuMode: z.enum(['skip', 'update']).default('skip'),
  defaultItemType: z.enum(['retail', 'food', 'beverage', 'service', 'green_fee', 'rental']).default('retail'),
  fileName: z.string().optional(),
});
export type ExecuteImportInput = z.input<typeof executeImportSchema>;
