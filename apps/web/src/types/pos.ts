import type { ItemTypeGroup } from '@oppsera/shared';

// ── POS Terminal Configuration ─────────────────────────────────────

export interface POSConfig {
  posMode: 'retail' | 'fnb';
  terminalId: string;
  locationId: string;
  defaultServiceCharges?: Array<{
    chargeType: string;
    name: string;
    calculationType: 'percentage' | 'fixed';
    value: number;
    isTaxable: boolean;
  }>;
  tipEnabled: boolean;
  receiptMode: 'print' | 'email' | 'both' | 'ask';
  barcodeEnabled: boolean;
  kitchenSendEnabled: boolean;
}

// ── Catalog Navigation ─────────────────────────────────────────────

export type CatalogNavLevel = 'department' | 'subdepartment' | 'category';

export interface CatalogNavState {
  departmentId: string | null;
  subDepartmentId: string | null;
  categoryId: string | null;
}

// ── Catalog Item (POS-optimized) ───────────────────────────────────

export interface CatalogItemForPOS {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  type: string;
  typeGroup: ItemTypeGroup;
  price: number; // cents
  isTrackInventory: boolean;
  onHand: number | null;
  metadata: Record<string, unknown>;
  tax: {
    calculationMode: string;
    taxRates: Array<{ id: string; name: string; rateDecimal: number }>;
  };
  categoryId: string;
  departmentId: string;
}

// ── Order Line Item ────────────────────────────────────────────────

export interface OrderLine {
  id: string;
  catalogItemId: string;
  catalogItemName: string;
  catalogItemSku: string | null;
  itemType: string;
  qty: number;
  unitPrice: number;
  originalUnitPrice: number | null;
  priceOverrideReason: string | null;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  modifiers: Array<{
    modifierId: string;
    name: string;
    priceAdjustment: number;
    isDefault: boolean;
  }> | null;
  specialInstructions: string | null;
  selectedOptions: Record<string, string> | null;
  packageComponents: Array<{
    catalogItemId: string;
    itemName: string;
    itemType: string;
    qty: number;
  }> | null;
  notes: string | null;
  sortOrder: number;
  taxCalculationMode: string;
}

// ── Order Charges & Discounts ──────────────────────────────────────

export interface OrderCharge {
  id: string;
  chargeType: string;
  name: string;
  calculationType: string;
  value: number;
  amount: number;
  taxAmount: number;
  isTaxable: boolean;
}

export interface OrderDiscount {
  id: string;
  type: string;
  value: number;
  amount: number;
  reason: string | null;
}

// ── Order ──────────────────────────────────────────────────────────

export interface Order {
  id: string;
  tenantId: string;
  locationId: string;
  orderNumber: string;
  status: string;
  source: string;
  version: number;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  discountTotal: number;
  total: number;
  customerId: string | null;
  businessDate: string;
  terminalId: string | null;
  employeeId: string | null;
  taxExempt: boolean;
  taxExemptReason: string | null;
  notes: string | null;
  lines?: OrderLine[];
  charges?: OrderCharge[];
  discounts?: OrderDiscount[];
  receiptSnapshot?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  placedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  heldAt?: string | null;
  heldBy?: string | null;
  // Enriched fields from list query (optional — present only in list responses)
  customerName?: string | null;
  paymentType?: string | null;
  tipTotal?: number;
}

// ── Tender ────────────────────────────────────────────────────────

export interface Tender {
  id: string;
  tenantId: string;
  locationId: string;
  orderId: string;
  tenderType: string;
  tenderSequence: number;
  amount: number; // cents
  tipAmount: number;
  changeGiven: number;
  amountGiven: number;
  currency: string;
  status: string;
  businessDate: string;
  shiftId: string | null;
  posMode: string | null;
  source: string;
  employeeId: string;
  terminalId: string;
  allocationSnapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string;
}

export interface TenderWithReversals extends Tender {
  reversals: Array<{
    id: string;
    reversalType: string;
    amount: number;
    reason: string;
    status: string;
    createdAt: string;
  }>;
  isReversed: boolean;
  effectiveStatus: 'captured' | 'reversed';
}

export interface TenderSummary {
  tenders: TenderWithReversals[];
  summary: {
    totalTendered: number;
    totalTips: number;
    totalChangeGiven: number;
    remainingBalance: number;
    isFullyPaid: boolean;
  };
}

export interface RecordTenderResult {
  tender: Tender;
  changeGiven: number;
  isFullyPaid: boolean;
  remainingBalance: number;
  totalTendered: number;
}

// ── Shift ──────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  terminalId: string;
  employeeId: string;
  locationId: string;
  businessDate: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  status: 'open' | 'closed';
}

export interface ShiftSummary {
  shiftId: string;
  employeeId: string;
  businessDate: string;
  terminalId: string;
  openedAt: string;
  closedAt: string;
  salesCount: number;
  salesTotal: number;
  voidCount: number;
  voidTotal: number;
  discountTotal: number;
  taxCollected: number;
  serviceChargeTotal: number;
  cashReceived: number;
  cardReceived: number;
  changeGiven: number;
  tipsCollected: number;
  openingBalance: number;
  closingBalance: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  salesByDepartment: Array<{
    departmentName: string;
    total: number;
    count: number;
  }>;
}

// ── POS Inputs ─────────────────────────────────────────────────────

export interface AddLineItemInput {
  catalogItemId: string;
  qty: number;
  modifiers?: Array<{
    modifierId: string;
    name: string;
    priceAdjustment: number;
    isDefault: boolean;
  }>;
  specialInstructions?: string;
  selectedOptions?: Record<string, string>;
  priceOverride?: PriceOverrideInput;
  notes?: string;
  /** Display info for optimistic UI — not sent to API */
  _display?: {
    name: string;
    unitPrice: number;
    itemType: string;
    sku?: string | null;
  };
}

export interface PriceOverrideInput {
  unitPrice: number;
  reason: string;
  approvedBy: string;
}

// ── Register Tabs ─────────────────────────────────────────────────

export type TabNumber = number; // 1-based, unlimited

export interface RegisterTab {
  id: string; // server-side PK
  tabNumber: TabNumber;
  orderId: string | null; // null = empty tab
  label?: string | null; // optional custom label
  employeeId?: string | null;
  employeeName?: string | null;
}

// ── Held Orders ────────────────────────────────────────────────────

export interface HeldOrder {
  id: string;
  orderNumber: string;
  itemCount: number;
  total: number;
  heldAt: string;
  heldBy: string;
  customerName: string | null;
  employeeId: string | null;
}
