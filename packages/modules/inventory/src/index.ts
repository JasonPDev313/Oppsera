export const MODULE_KEY = 'inventory' as const;
export const MODULE_NAME = 'Inventory Management';
export const MODULE_VERSION = '1.0.0';

// Register event contracts (side-effect import)
import './events/contracts';

// Commands
export { receiveInventory } from './commands/receive-inventory';
export { adjustInventory } from './commands/adjust-inventory';
export { transferInventory } from './commands/transfer-inventory';
export { recordShrink } from './commands/record-shrink';

// Queries
export { listInventoryItems } from './queries/list-inventory-items';
export type { ListInventoryItemsInput, ListInventoryItemsResult, InventoryItemWithOnHand } from './queries/list-inventory-items';
export { getInventoryItem } from './queries/get-inventory-item';
export type { InventoryItemDetail } from './queries/get-inventory-item';
export { getInventoryItemByCatalogItem } from './queries/get-inventory-item-by-catalog';
export { getMovements } from './queries/get-movements';
export type { GetMovementsInput, GetMovementsResult } from './queries/get-movements';

// Validation schemas + types
export {
  receiveInventorySchema,
  adjustInventorySchema,
  transferInventorySchema,
  recordShrinkSchema,
} from './validation';
export type {
  ReceiveInventoryInput,
  AdjustInventoryInput,
  TransferInventoryInput,
  RecordShrinkInput,
} from './validation';

// Receiving commands
export {
  createDraftReceipt,
  updateDraftReceipt,
  addReceiptLine,
  updateReceiptLine,
  removeReceiptLine,
  addReceiptCharge,
  updateReceiptCharge,
  removeReceiptCharge,
  postReceipt,
  voidReceipt,
  createVendor,
  updateVendor,
} from './commands/receiving';

// Receiving queries
export { getReceipt } from './queries/get-receipt';
export type { ReceiptDetail, ReceiptLineDetail, ReceiptChargeDetail } from './queries/get-receipt';
export { listReceipts } from './queries/list-receipts';
export type { ListReceiptsInput, ListReceiptsResult, ReceiptSummary } from './queries/list-receipts';
export { searchItemsForReceiving } from './queries/search-items';
export type { SearchItemResult } from './queries/search-items';
export { getReorderSuggestions } from './queries/reorder-suggestions';
export type { ReorderSuggestion } from './queries/reorder-suggestions';
export { listVendors } from './queries/list-vendors';
export type { ListVendorsInput, ListVendorsResult, VendorSummary } from './queries/list-vendors';

// Receiving validation
export {
  createReceiptSchema,
  updateReceiptSchema,
  addReceiptLineSchema,
  updateReceiptLineSchema,
  addReceiptChargeSchema,
  updateReceiptChargeSchema,
  removeReceiptChargeSchema,
  postReceiptSchema,
  voidReceiptSchema,
  createVendorSchema,
  updateVendorSchema,
} from './validation/receiving';
export type {
  CreateReceiptInput,
  UpdateReceiptInput,
  AddReceiptLineInput,
  UpdateReceiptLineInput,
  AddReceiptChargeInput,
  UpdateReceiptChargeInput,
  RemoveReceiptChargeInput,
  PostReceiptInput,
  VoidReceiptInput,
  CreateVendorInput,
  UpdateVendorInput,
  FreightMode,
  AllocationMethodEnum,
} from './validation/receiving';

// Vendor management commands
export {
  deactivateVendor,
  reactivateVendor,
  addVendorCatalogItem,
  updateVendorCatalogItem,
  deactivateVendorCatalogItem,
} from './commands/vendor-management';

// Vendor management queries
export { getVendor } from './queries/get-vendor';
export type { VendorDetail } from './queries/get-vendor';
export { searchVendors } from './queries/list-vendors';
export type { VendorSearchResult } from './queries/list-vendors';
export { getVendorCatalog, getItemVendors } from './queries/get-vendor-catalog';
export type { VendorCatalogEntry, GetVendorCatalogInput, GetVendorCatalogResult, ItemVendorEntry } from './queries/get-vendor-catalog';

// Vendor management validation
export {
  vendorSchema,
  updateVendorManagementSchema,
  addVendorCatalogItemSchema,
  updateVendorCatalogItemSchema,
  vendorListFilterSchema,
} from './validation/vendor-management';
export type {
  VendorInput,
  UpdateVendorManagementInput,
  AddVendorCatalogItemInput,
  UpdateVendorCatalogItemInput,
  VendorListFilterInput,
} from './validation/vendor-management';

// Vendor integration hooks
export { getVendorItemDefaults } from './services/vendor-integration';
export type { VendorItemDefaults } from './services/vendor-integration';

// Helpers
export { getOnHand } from './helpers/get-on-hand';
export { checkStockAlerts } from './helpers/stock-alerts';
export { findByCatalogItemId } from './helpers/find-by-catalog-item';

// Event consumers
export { handleOrderPlaced, handleOrderVoided, handleOrderReturned, handleCatalogItemCreated } from './events/consumers';
