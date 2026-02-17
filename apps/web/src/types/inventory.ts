export interface InventoryItem {
  id: string;
  tenantId: string;
  locationId: string;
  catalogItemId: string;
  sku: string | null;
  name: string;
  itemType: string;
  status: string;
  trackInventory: boolean;
  baseUnit: string;
  purchaseUnit: string;
  purchaseToBaseRatio: string;
  costingMethod: string;
  standardCost: string | null;
  reorderPoint: string | null;
  reorderQuantity: string | null;
  parLevel: string | null;
  allowNegative: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  onHand: number;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  locationId: string;
  inventoryItemId: string;
  movementType: string;
  quantityDelta: string;
  unitCost: string | null;
  extendedCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  source: string;
  businessDate: string;
  employeeId: string | null;
  terminalId: string | null;
  batchId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string | null;
}

export type MovementType = 'receive' | 'sale' | 'void_reversal' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'shrink' | 'waste' | 'return' | 'initial' | 'conversion';
export type ShrinkType = 'waste' | 'theft' | 'damage' | 'expiry' | 'other';
export type InventoryStatus = 'active' | 'discontinued' | 'archived';
