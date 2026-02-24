export const MODULE_KEY = 'legacy_import' as const;
export const MODULE_NAME = 'Legacy Transaction Import';
export const MODULE_VERSION = '0.1.0';

// ── Commands ─────────────────────────────────────────────────────────
export { createImportJob } from './commands/create-import-job';
export { updateColumnMappings } from './commands/update-column-mappings';
export { updateTenderMappings } from './commands/update-tender-mappings';
export { updateTaxMappings } from './commands/update-tax-mappings';
export { updateItemMappings } from './commands/update-item-mappings';
export { validateImport } from './commands/validate-import';
export { executeImport } from './commands/execute-import';
export { cancelImport } from './commands/cancel-import';

// ── Queries ──────────────────────────────────────────────────────────
export { getImportJob } from './queries/get-import-job';
export { listImportJobs } from './queries/list-import-jobs';
export { getImportErrors } from './queries/get-import-errors';
export { getImportProgress } from './queries/get-import-progress';
export { getReconciliation } from './queries/get-reconciliation';

// ── Services (for testing / direct use) ──────────────────────────────
export { parseCsv, extractSampleRows, getColumnValues } from './services/csv-parser';
export { analyzeColumns } from './services/analysis-engine';
export { autoMapColumns, getTargetFieldsForEntity } from './services/mapping-engine';
export { autoMapTenders } from './services/tender-mapper';
export { detectTaxColumns, autoMapTaxColumns, detectTaxRate } from './services/tax-mapper';
export { groupRowsIntoOrders } from './services/grouping-engine';
export { resolveItems, extractDistinctItems } from './services/item-resolver';
export { stageOrders } from './services/staging-engine';
export { computeReconciliation } from './services/reconciliation-engine';
export { processStagedsRows } from './services/import-processor';

// ── Validation Schemas ───────────────────────────────────────────────
export {
  createImportJobSchema,
  updateColumnMappingsSchema,
  updateTenderMappingsSchema,
  updateTaxMappingsSchema,
  updateItemMappingsSchema,
  validateImportSchema,
  executeImportSchema,
  cancelImportSchema,
  listImportJobsSchema,
  getImportJobSchema,
  getImportErrorsSchema,
  getImportProgressSchema,
} from './validation';

export type {
  CreateImportJobInput,
  UpdateColumnMappingsInput,
  UpdateTenderMappingsInput,
  UpdateTaxMappingsInput,
  UpdateItemMappingsInput,
  ValidateImportInput,
  ExecuteImportInput,
  CancelImportInput,
  ListImportJobsInput,
  GetImportJobInput,
  GetImportErrorsInput,
  GetImportProgressInput,
} from './validation';

// ── Service Types ────────────────────────────────────────────────────
export type { ParsedCsv } from './services/csv-parser';
export type { DetectedColumn, AnalysisResult } from './services/analysis-engine';
export type { ColumnMapping } from './services/mapping-engine';
export type { TenderMappingSuggestion } from './services/tender-mapper';
export type { TaxMappingSuggestion } from './services/tax-mapper';
export type { GroupedOrder } from './services/grouping-engine';
export type { ItemResolution, CatalogItemRef } from './services/item-resolver';
export type { StagedRow, StagingResult } from './services/staging-engine';
export type { ReconciliationSummary } from './services/reconciliation-engine';
export type { ProcessedOrder, ProcessedLine, ProcessedTender, ProcessingResult } from './services/import-processor';
