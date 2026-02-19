// ── Vendor (list view) ──────────────────────────────────────────
export interface VendorSummary {
  id: string;
  name: string;
  accountNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  isActive: boolean;
  itemCount: number;
  lastReceiptDate: string | null;
  createdAt: string;
}

// ── Vendor (full detail) ────────────────────────────────────────
export interface VendorDetail {
  id: string;
  name: string;
  nameNormalized: string;
  accountNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  notes: string | null;
  website: string | null;
  defaultPaymentTerms: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  activeCatalogItemCount: number;
  totalReceiptCount: number;
  totalSpend: number;
  lastReceiptDate: string | null;
}

// ── Vendor Search Result (picker dropdown) ──────────────────────
export interface VendorSearchResult {
  id: string;
  name: string;
  accountNumber: string | null;
}

// ── Vendor Catalog Entry ────────────────────────────────────────
export interface VendorCatalogEntry {
  id: string;
  inventoryItemId: string;
  itemName: string;
  itemSku: string | null;
  vendorSku: string | null;
  vendorCost: number | null;
  lastCost: number | null;
  lastReceivedAt: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  minOrderQty: number | null;
  packSize: string | null;
  notes: string | null;
}

// ── Vendor Form Input ───────────────────────────────────────────
export interface VendorFormInput {
  name: string;
  accountNumber?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentTerms?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  taxId?: string | null;
  notes?: string | null;
  website?: string | null;
  defaultPaymentTerms?: string | null;
}

// ── Vendor Catalog Item Input ───────────────────────────────────
export interface VendorCatalogItemInput {
  inventoryItemId: string;
  vendorSku?: string | null;
  vendorCost?: number | null;
  leadTimeDays?: number | null;
  isPreferred?: boolean;
  minOrderQty?: number | null;
  packSize?: string | null;
  notes?: string | null;
}
