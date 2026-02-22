// ── Drawer Session ──────────────────────────────────────────────

export interface DrawerSession {
  id: string;
  tenantId: string;
  locationId: string;
  terminalId: string;
  profitCenterId: string | null;
  employeeId: string;
  businessDate: string;
  status: 'open' | 'closed';
  openingBalanceCents: number;
  changeFundCents: number;
  closingCountCents: number | null;
  expectedCashCents: number | null;
  varianceCents: number | null;
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Drawer Session Event ────────────────────────────────────────

export type DrawerEventType = 'paid_in' | 'paid_out' | 'cash_drop' | 'drawer_open' | 'no_sale';

export interface DrawerSessionEvent {
  id: string;
  tenantId: string;
  drawerSessionId: string;
  eventType: DrawerEventType;
  amountCents: number;
  reason: string | null;
  employeeId: string;
  approvedBy: string | null;
  // Cash drop enhancements (ACCT-CLOSE-01)
  bagId: string | null;
  sealNumber: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  depositSlipId: string | null;
  createdAt: string;
}

// ── Drawer Session Summary ──────────────────────────────────────

export interface DrawerSessionSummary {
  sessionId: string;
  employeeId: string;
  terminalId: string;
  locationId: string;
  businessDate: string;
  openedAt: string;
  closedAt: string | null;
  openingBalanceCents: number;
  changeFundCents: number;
  closingCountCents: number | null;
  expectedCashCents: number;
  varianceCents: number | null;
  // Aggregated from tenders/orders
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
  // Event totals
  paidInTotal: number;
  paidOutTotal: number;
  cashDropTotal: number;
  drawerOpenCount: number;
  noSaleCount: number;
  // Events list
  events: DrawerSessionEvent[];
  // Sales by department
  salesByDepartment: Array<{
    departmentName: string;
    total: number;
    count: number;
  }>;
}

// ── Denomination Breakdown ──────────────────────────────────────

export interface DenominationBreakdown {
  hundreds: number;
  fifties: number;
  twenties: number;
  tens: number;
  fives: number;
  ones: number;
  quarters: number;
  dimes: number;
  nickels: number;
  pennies: number;
}

export function computeDenominationTotal(d: DenominationBreakdown): number {
  return (
    d.hundreds * 10000 +
    d.fifties * 5000 +
    d.twenties * 2000 +
    d.tens * 1000 +
    d.fives * 500 +
    d.ones * 100 +
    d.quarters * 25 +
    d.dimes * 10 +
    d.nickels * 5 +
    d.pennies
  );
}
