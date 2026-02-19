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
  deactivateItem,
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
} from './commands';

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
} from './queries';
export { getCatalogForPOS } from './queries/get-catalog-for-pos';
export type { POSCatalogItem, POSCategory, POSCatalogResult } from './queries/get-catalog-for-pos';
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

// Re-export tax calculation
export { calculateTaxes } from './tax-calc';
export type {
  TaxCalculationInput,
  TaxCalculationResult,
  TaxRateBreakdown,
} from './tax-calc';
