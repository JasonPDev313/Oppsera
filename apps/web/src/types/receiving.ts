// ── Receipt Status ──────────────────────────────────────────────
export type ReceiptStatus = 'draft' | 'posted' | 'voided';

// ── Freight Mode ───────────────────────────────────────────────
export type FreightMode = 'expense' | 'allocate';
export type AllocationMethod = 'by_cost' | 'by_qty' | 'by_weight' | 'by_volume' | 'manual' | 'none';

// ── Receipt Charge ─────────────────────────────────────────────
export interface ReceiptCharge {
  id: string;
  chargeType: string;
  description: string | null;
  amount: number;
  glAccountCode: string | null;
  glAccountName: string | null;
  sortOrder: number;
}

// ── Vendor ──────────────────────────────────────────────────────
export interface Vendor {
  id: string;
  name: string;
  accountNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Cost Preview ────────────────────────────────────────────────
export interface CostPreview {
  currentOnHand: number;
  currentCost: number;
  newCost: number;
  newOnHand: number;
  marginPct: number | null;
}

// ── Receipt Line ────────────────────────────────────────────────
export interface ReceiptLine {
  id: string;
  inventoryItemId: string;
  itemName: string;
  itemSku: string | null;
  vendorItemId: string | null;
  quantityReceived: number;
  uomCode: string;
  unitCost: number;
  extendedCost: number;
  allocatedShipping: number;
  landedCost: number;
  landedUnitCost: number;
  baseQty: number;
  weight: number | null;
  volume: number | null;
  lotNumber: string | null;
  serialNumbers: string[] | null;
  expirationDate: string | null;
  sortOrder: number;
  notes: string | null;
  costPreview: CostPreview | null;
}

// ── Receipt (full detail) ───────────────────────────────────────
export interface Receipt {
  id: string;
  tenantId: string;
  locationId: string;
  vendorId: string;
  vendorName: string;
  receiptNumber: string;
  status: ReceiptStatus;
  vendorInvoiceNumber: string | null;
  receivedDate: string;
  freightMode: FreightMode;
  shippingCost: number;
  shippingAllocationMethod: AllocationMethod;
  taxAmount: number;
  subtotal: number;
  total: number;
  notes: string | null;
  postedAt: string | null;
  postedBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines: ReceiptLine[];
  charges: ReceiptCharge[];
}

// ── Receipt Summary (list view) ─────────────────────────────────
export interface ReceiptSummary {
  id: string;
  receiptNumber: string;
  status: ReceiptStatus;
  vendorId: string;
  vendorName: string;
  locationId: string;
  receivedDate: string;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
  vendorInvoiceNumber: string | null;
  postedAt: string | null;
  createdAt: string;
}

// ── Item Search Result ──────────────────────────────────────────
export interface ReceivingItemSearchResult {
  id: string;
  catalogItemId: string;
  inventoryItemId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  itemType: string;
  baseUnit: string;
  costingMethod: string;
  currentCost: number;
  standardCost: number | null;
  matchedOn: 'barcode' | 'sku' | 'name' | null;
  vendorCost: number | null;
  vendorSku: string | null;
}

// ── Reorder Suggestion ──────────────────────────────────────────
export interface ReorderSuggestion {
  id: string;
  name: string;
  sku: string | null;
  onHand: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  parLevel: number | null;
  suggestedOrderQty: number;
  preferredVendorId: string | null;
  preferredVendorName: string | null;
  vendorCost: number | null;
}
