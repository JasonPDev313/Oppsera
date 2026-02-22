// ── Comp Event ──────────────────────────────────────────────────

export type CompType = 'item' | 'order';
export type CompCategory = 'manager' | 'promo' | 'quality' | 'other';

export interface CompEvent {
  id: string;
  tenantId: string;
  locationId: string;
  orderId: string;
  orderLineId: string | null;
  compType: CompType;
  amountCents: number;
  reason: string;
  compCategory: CompCategory;
  approvedBy: string;
  glJournalEntryId: string | null;
  businessDate: string;
  createdAt: string;
}

// ── Void Line Result ────────────────────────────────────────────

export interface VoidLineResult {
  orderId: string;
  orderLineId: string;
  voidedAmountCents: number;
  newOrderTotal: number;
  wasteTracking: boolean;
}
