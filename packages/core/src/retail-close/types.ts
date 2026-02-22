export type RetailCloseBatchStatus = 'open' | 'in_progress' | 'reconciled' | 'posted' | 'locked';

export interface TenderBreakdownEntry {
  tenderType: string;
  count: number;
  totalCents: number;
}

export interface DepartmentSalesEntry {
  departmentName: string;
  count: number;
  totalCents: number;
}

export interface TaxGroupEntry {
  taxGroupName: string;
  taxRatePercent: number;
  taxableCents: number;
  collectedCents: number;
}

export interface RetailCloseBatch {
  id: string;
  tenantId: string;
  locationId: string;
  terminalId: string;
  businessDate: string;
  drawerSessionId: string | null;
  status: RetailCloseBatchStatus;

  grossSalesCents: number;
  netSalesCents: number;
  taxCollectedCents: number;
  discountTotalCents: number;
  voidTotalCents: number;
  voidCount: number;
  serviceChargeCents: number;
  tipsCreditCents: number;
  tipsCashCents: number;
  orderCount: number;
  refundTotalCents: number;
  refundCount: number;

  tenderBreakdown: TenderBreakdownEntry[];
  salesByDepartment: DepartmentSalesEntry[] | null;
  taxByGroup: TaxGroupEntry[] | null;

  cashExpectedCents: number;
  cashCountedCents: number | null;
  cashOverShortCents: number | null;

  startedAt: string | null;
  startedBy: string | null;
  reconciledAt: string | null;
  reconciledBy: string | null;
  postedAt: string | null;
  postedBy: string | null;
  lockedAt: string | null;
  lockedBy: string | null;

  glJournalEntryId: string | null;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface RetailBatchJournalLine {
  category: string;
  description: string;
  debitCents: number;
  creditCents: number;
}
