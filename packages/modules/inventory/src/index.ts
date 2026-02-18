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
export { archiveInventoryItem } from './commands/archive-inventory-item';

// Queries
export { listInventoryItems } from './queries/list-inventory-items';
export type { ListInventoryItemsInput, ListInventoryItemsResult, InventoryItemWithOnHand } from './queries/list-inventory-items';
export { getInventoryItem } from './queries/get-inventory-item';
export type { InventoryItemDetail } from './queries/get-inventory-item';
export { getMovements } from './queries/get-movements';
export type { GetMovementsInput, GetMovementsResult } from './queries/get-movements';

// Validation schemas + types
export {
  receiveInventorySchema,
  adjustInventorySchema,
  transferInventorySchema,
  recordShrinkSchema,
  archiveInventoryItemSchema,
} from './validation';
export type {
  ReceiveInventoryInput,
  AdjustInventoryInput,
  TransferInventoryInput,
  RecordShrinkInput,
  ArchiveInventoryItemInput,
} from './validation';

// Helpers
export { getOnHand } from './helpers/get-on-hand';
export { checkStockAlerts } from './helpers/stock-alerts';
export { findByCatalogItemId } from './helpers/find-by-catalog-item';

// Event consumers
export { handleOrderPlaced, handleOrderVoided, handleCatalogItemCreated } from './events/consumers';
