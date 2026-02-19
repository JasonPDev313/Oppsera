import { registerContracts } from '@oppsera/core/events/contracts';
import {
  InventoryReceivedDataSchema,
  InventoryAdjustedDataSchema,
  InventoryLowStockDataSchema,
  InventoryNegativeDataSchema,
  OrderPlacedDataSchema,
  OrderVoidedDataSchema,
  CatalogItemCreatedDataSchema,
  CatalogItemArchivedDataSchema,
  CatalogItemUnarchivedDataSchema,
} from './types';

registerContracts({
  moduleName: 'inventory',
  emits: [
    { eventType: 'inventory.received.v1', dataSchema: InventoryReceivedDataSchema },
    { eventType: 'inventory.adjusted.v1', dataSchema: InventoryAdjustedDataSchema },
    { eventType: 'inventory.low_stock.v1', dataSchema: InventoryLowStockDataSchema },
    { eventType: 'inventory.negative.v1', dataSchema: InventoryNegativeDataSchema },
  ],
  consumes: [
    { eventType: 'order.placed.v1', dataSchema: OrderPlacedDataSchema },
    { eventType: 'order.voided.v1', dataSchema: OrderVoidedDataSchema },
    { eventType: 'catalog.item.created.v1', dataSchema: CatalogItemCreatedDataSchema },
    { eventType: 'catalog.item.archived.v1', dataSchema: CatalogItemArchivedDataSchema },
    { eventType: 'catalog.item.unarchived.v1', dataSchema: CatalogItemUnarchivedDataSchema },
  ],
});
