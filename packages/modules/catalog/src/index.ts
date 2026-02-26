export const MODULE_KEY = 'catalog' as const;
export const MODULE_NAME = 'Product Catalog';
export const MODULE_VERSION = '1.0.0';

// Re-export schema for Drizzle
export * from './schema';

// Re-export the internal read API
export { getCatalogReadApi, setCatalogReadApi } from './internal-api';
export type { CatalogReadApi, ItemTaxInfo, PosItemData } from '@oppsera/core/helpers/catalog-read-api';

// Re-export registration helper
export { registerCatalogReadApi } from './register';

// Re-export event contracts (side-effect import)
import './events/contracts';

// Re-export types
export type {
  CatalogItem,
  CatalogCategory,
  TaxCategory,
  ModifierGroup,
  Modifier,
  CatalogItemWithModifiers,
  ModifierGroupWithModifiers,
} from './types';

// Re-export commands
export {
  createTaxCategory,
  createCategory,
  createItem,
  updateItem,
  archiveItem,
  unarchiveItem,
  createModifierGroup,
  updateModifierGroup,
  setLocationPrice,
  removeLocationPrice,
  createTaxRate,
  updateTaxRate,
  createTaxGroup,
  updateTaxGroup,
  addTaxRateToGroup,
  removeTaxRateFromGroup,
  assignItemTaxGroups,
  importInventory,
  createModifierGroupCategory,
  updateModifierGroupCategory,
  deleteModifierGroupCategory,
  bulkAssignModifierGroups,
  updateItemModifierAssignment,
  removeItemModifierAssignment,
} from './commands';
export type { ImportResult, BulkAssignResult } from './commands';

// Re-export queries
export {
  listItems,
  getItem,
  listCategories,
  listModifierGroups,
  listTaxCategories,
  listTaxRates,
  listTaxGroups,
  getItemTaxGroupsAtLocation,
  listCatalogImportLogs,
  listModifierGroupCategories,
  getModifierGroup,
  getItemModifierAssignments,
} from './queries';
export type { CatalogImportLogSummary } from './queries/list-catalog-import-logs';
export type { ModifierGroupCategoryRow } from './queries/list-modifier-group-categories';
export type { ModifierGroupFullDetail } from './queries/get-modifier-group';
export type { ItemModifierAssignmentDetail } from './queries/get-item-modifier-assignments';
export { getCatalogForPOS } from './queries/get-catalog-for-pos';
export type {
  POSCatalogItem,
  POSCategory,
  POSCatalogResult,
  POSModifierGroup,
  POSModifierOption,
  POSItemModifierAssignment,
  POSModifierGroupCategory,
} from './queries/get-catalog-for-pos';
export { getItemChangeLog } from './queries/get-item-change-log';
export type { GetItemChangeLogInput, GetItemChangeLogResult } from './queries/get-item-change-log';
export type { ActionType, ChangeSource, FieldChange, ChangeLogEntry } from './services/item-change-log';
export { FIELD_DISPLAY } from './services/item-change-log';
export type { ListItemsInput, ListItemsResult, ListItemRow } from './queries/list-items';
export type { ItemDetail } from './queries/get-item';
export type { CategoryWithCount } from './queries/list-categories';
export type { ModifierGroupDetail } from './queries/list-modifier-groups';
export type { TaxGroupWithRates } from './queries/list-tax-groups';
export type { ItemTaxGroupAssignment } from './queries/get-item-tax-groups';

// Re-export validation schemas
export {
  createTaxCategorySchema,
  createCategorySchema,
  createItemSchema,
  updateItemSchema,
  createModifierGroupSchema,
  updateModifierGroupSchema,
  setLocationPriceSchema,
  removeLocationPriceSchema,
  updateTaxCategorySchema,
  updateCategorySchema,
  archiveItemSchema,
  createModifierGroupCategorySchema,
  updateModifierGroupCategorySchema,
  bulkAssignModifierGroupsSchema,
  updateItemModifierAssignmentSchema,
  instructionModeEnum,
  defaultBehaviorEnum,
  channelEnum,
} from './validation';
export type {
  CreateTaxCategoryInput,
  CreateCategoryInput,
  CreateItemInput,
  UpdateItemInput,
  CreateModifierGroupInput,
  UpdateModifierGroupInput,
  SetLocationPriceInput,
  RemoveLocationPriceInput,
  UpdateTaxCategoryInput,
  UpdateCategoryInput,
  ArchiveItemInput,
  CreateModifierGroupCategoryInput,
  UpdateModifierGroupCategoryInput,
  BulkAssignModifierGroupsInput,
  UpdateItemModifierAssignmentInput,
} from './validation';

// Re-export tax validation schemas
export {
  createTaxRateSchema,
  updateTaxRateSchema,
  createTaxGroupSchema,
  updateTaxGroupSchema,
  addTaxRateToGroupSchema,
  removeTaxRateFromGroupSchema,
  assignItemTaxGroupsSchema,
} from './validation-taxes';
export type {
  CreateTaxRateInput,
  UpdateTaxRateInput,
  CreateTaxGroupInput,
  UpdateTaxGroupInput,
  AddTaxRateToGroupInput,
  RemoveTaxRateFromGroupInput,
  AssignItemTaxGroupsInput,
} from './validation-taxes';

// Re-export import validation schemas
export {
  analyzeImportSchema,
  validateImportSchema,
  executeImportSchema,
} from './validation-import';
export type {
  AnalyzeImportInput,
  ValidateImportInput,
  ExecuteImportInput,
} from './validation-import';

// Re-export import services
export { analyzeColumns } from './services/inventory-import-analyzer';
export type { ColumnMapping, AnalysisResult, TargetField } from './services/inventory-import-analyzer';
export { parseCsv } from './services/inventory-import-parser';
export type { CsvParseResult, CsvParseError } from './services/inventory-import-parser';
export { validateImport } from './services/inventory-import-validator';
export type { ParsedItem, ValidationResult, ValidationStats } from './services/inventory-import-validator';

// Re-export tax calculation
export { calculateTaxes } from './tax-calc';
export type {
  TaxCalculationInput,
  TaxCalculationResult,
  TaxRateBreakdown,
} from './tax-calc';
