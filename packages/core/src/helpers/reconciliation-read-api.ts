// ── Orders Domain Return Types ───────────────────────────────

export interface OrdersSummaryData {
  grossSalesCents: number;
  discountTotalCents: number;
  netSalesCents: number;
  taxCents: number;
  serviceChargeCents: number;
  orderCount: number;
  voidCount: number;
  voidAmountCents: number;
}

export interface TaxBreakdownRow {
  taxRateId: string | null;
  taxRateName: string;
  rateDecimal: number;
  jurisdictionCode: string | null;
  authorityName: string | null;
  authorityType: string | null;
  taxType: string;
  taxableSalesCents: number;
  taxCollectedCents: number;
  effectiveRate: number;
  orderCount: number;
}

export interface TaxRemittanceRow {
  jurisdictionCode: string | null;
  authorityName: string | null;
  authorityType: string | null;
  taxType: string;
  filingFrequency: string | null;
  taxRateId: string | null;
  taxRateName: string;
  rateDecimal: number;
  taxableSalesCents: number;
  taxCollectedCents: number;
  exemptSalesCents: number;
  orderCount: number;
}

export interface CompTotalData {
  totalCompsCents: number;
}

// ── Tenders Domain Return Types ─────────────────────────────

export interface TendersSummaryData {
  cashCents: number;
  cardCents: number;
  otherCents: number;
  totalCents: number;
  tenderCount: number;
  tipsCents: number;
}

export interface TenderAuditTrailStep {
  stage: string;
  label: string;
  status: 'complete' | 'pending' | 'missing';
  timestamp: string | null;
  referenceId: string | null;
  detail?: string;
}

export interface TenderAuditTrailData {
  tenderId: string;
  tenderType: string;
  amountCents: number;
  tipAmountCents: number;
  orderId: string;
  orderNumber: string | null;
  businessDate: string;
  locationId: string;
  employeeId: string | null;
  steps: TenderAuditTrailStep[];
}

export interface UnmatchedTenderRow {
  id: string;
  orderId: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
  businessDate: string;
  cardLast4: string | null;
  cardBrand: string | null;
  providerRef: string | null;
  createdAt: string;
}

// ── Settlements Domain Return Types ─────────────────────────

export interface SettlementFilters {
  status?: string;
  processorName?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface SettlementListItem {
  id: string;
  locationId: string | null;
  settlementDate: string;
  processorName: string;
  processorBatchId: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  chargebackAmount: number;
  status: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  glJournalEntryId: string | null;
  importSource: string;
  businessDateFrom: string | null;
  businessDateTo: string | null;
  notes: string | null;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  createdAt: string;
}

export interface SettlementListResult {
  items: SettlementListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export interface SettlementLineDetail {
  id: string;
  tenderId: string | null;
  originalAmountCents: number;
  settledAmountCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  matchedAt: string | null;
  tenderType: string | null;
  tenderBusinessDate: string | null;
  orderId: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
}

export interface SettlementDetailData {
  id: string;
  locationId: string | null;
  settlementDate: string;
  processorName: string;
  processorBatchId: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  chargebackAmount: number;
  status: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  glJournalEntryId: string | null;
  importSource: string;
  businessDateFrom: string | null;
  businessDateTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: SettlementLineDetail[];
}

// ── Tips Domain Return Types ────────────────────────────────

export interface TipBalanceRow {
  employeeId: string;
  employeeName: string | null;
  totalTipsCents: number;
  totalPaidCents: number;
  balanceCents: number;
  lastTipDate: string | null;
  lastPayoutDate: string | null;
}

export interface TipPayoutFilters {
  locationId?: string;
  employeeId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface TipPayoutItem {
  id: string;
  locationId: string;
  employeeId: string;
  employeeName: string | null;
  payoutType: string;
  amountCents: number;
  businessDate: string;
  drawerSessionId: string | null;
  payrollPeriod: string | null;
  status: string;
  approvedBy: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface TipPayoutListResult {
  items: TipPayoutItem[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Location Close Domain Return Types ──────────────────────

export interface TerminalCloseStatus {
  terminalId: string;
  terminalName: string | null;
  drawerSessionStatus: string | null;
  closeBatchStatus: string | null;
  closeBatchId: string | null;
}

export interface LocationCloseStatusData {
  locationId: string;
  businessDate: string;
  retailTerminals: TerminalCloseStatus[];
  fnbBatchStatus: string | null;
  fnbBatchId: string | null;
  depositSlipId: string | null;
  depositSlipStatus: string | null;
  allTerminalsClosed: boolean;
  fnbClosed: boolean;
  depositReady: boolean;
}

// ── Inventory Domain Return Types ───────────────────────────

export interface InventoryMovementsSummaryData {
  beginningInventoryDollars: number;
  endingInventoryDollars: number;
}

// ── GL Remap Domain Return Types ────────────────────────────

export interface TenderForGlRepostLineData {
  catalogItemId: string;
  catalogItemName: string;
  subDepartmentId: string | null;
  qty: number;
  extendedPriceCents: number;
  taxGroupId: string | null;
  taxAmountCents: number;
  costCents: number | null;
  packageComponents: Array<{
    catalogItemId: string;
    catalogItemName: string;
    subDepartmentId: string | null;
    qty: number;
    componentUnitPriceCents: number;
    componentExtendedCents: number;
    allocatedRevenueCents: number;
    allocationWeight: number;
  }> | null;
}

export interface TenderForGlRepostData {
  tenderId: string;
  orderId: string;
  tenantId: string;
  locationId: string;
  tenderType: string;
  paymentMethod: string;
  amount: number;
  tipAmount: number;
  customerId: string | null;
  terminalId: string | null;
  tenderSequence: number;
  isFullyPaid: boolean;
  orderTotal: number;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  serviceChargeTotal: number;
  totalTendered: number;
  businessDate: string;
  lines: TenderForGlRepostLineData[];
}

// ── ACH Domain Return Types ────────────────────────────────

export interface AchReturnSummaryData {
  totalReturns: number;
  totalReturnedCents: number;
  byCode: Array<{
    returnCode: string;
    returnReason: string;
    count: number;
  }>;
}

export interface AchSettlementSummaryData {
  pendingCount: number;
  pendingAmountCents: number;
  originatedCount: number;
  originatedAmountCents: number;
  settledCount: number;
  settledAmountCents: number;
  returnedCount: number;
  returnedAmountCents: number;
}

// ── Interface ───────────────────────────────────────────────

export interface ReconciliationReadApi {
  // ── Orders Domain (5 methods → orders module) ─────────────
  getOrdersSummary(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<OrdersSummaryData>;

  getTaxBreakdown(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<TaxBreakdownRow[]>;

  getTaxRemittanceData(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<TaxRemittanceRow[]>;

  getCompTotals(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<CompTotalData>;

  getOrderAuditCount(
    tenantId: string, startDate: string, endDate: string,
  ): Promise<number>;

  // ── Tenders Domain (4 methods → payments module) ──────────
  getTendersSummary(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<TendersSummaryData>;

  getTenderAuditTrail(
    tenantId: string, tenderId: string,
  ): Promise<TenderAuditTrailData | null>;

  getUnmatchedTenders(
    tenantId: string, startDate: string, endDate: string,
  ): Promise<UnmatchedTenderRow[]>;

  getTenderAuditCount(
    tenantId: string, startDate: string, endDate: string,
  ): Promise<number>;

  // ── Settlements Domain (3 methods → payments module) ──────
  listSettlements(
    tenantId: string, filters: SettlementFilters,
  ): Promise<SettlementListResult>;

  getSettlementDetail(
    tenantId: string, settlementId: string,
  ): Promise<SettlementDetailData | null>;

  getSettlementStatusCounts(
    tenantId: string, period: string,
  ): Promise<{ total: number; unposted: number }>;

  // ── Cash Operations Domain (4 methods → payments module) ──
  getDrawerSessionStatus(
    tenantId: string, period: string,
  ): Promise<{ total: number; openCount: number }>;

  getRetailCloseStatus(
    tenantId: string, period: string,
  ): Promise<{ total: number; unposted: number }>;

  getCashOnHand(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<number>;

  getOverShortTotal(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<number>;

  // ── Tips Domain (4 methods → payments module) ─────────────
  getTipBalances(
    tenantId: string, asOfDate: string, locationId?: string,
  ): Promise<TipBalanceRow[]>;

  listTipPayouts(
    tenantId: string, filters: TipPayoutFilters,
  ): Promise<TipPayoutListResult>;

  getPendingTipCount(
    tenantId: string, period: string,
  ): Promise<number>;

  getOutstandingTipsCents(
    tenantId: string, startDate: string, endDate: string, locationId?: string,
  ): Promise<number>;

  // ── Deposits Domain (1 method → payments module) ──────────
  getDepositStatus(
    tenantId: string, period: string,
  ): Promise<{ total: number; unreconciled: number }>;

  // ── Location Close (1 method → payments module) ───────────
  getLocationCloseStatus(
    tenantId: string, locationId: string, businessDate: string,
  ): Promise<LocationCloseStatusData>;

  // ── F&B Domain (1 method → fnb module) ────────────────────
  getFnbCloseStatus(
    tenantId: string, period: string,
  ): Promise<{ total: number; unposted: number }>;

  // ── Inventory Domain (2 methods → inventory module) ───────
  getInventoryMovementsSummary(
    tenantId: string, locationId: string | undefined, periodStart: string, periodEnd: string,
  ): Promise<InventoryMovementsSummaryData>;

  getReceivingPurchasesTotals(
    tenantId: string, periodStart: string, periodEnd: string,
  ): Promise<number>;

  // ── GL Remap Domain (1 method → payments module) ──────────
  getTenderForGlRepost(
    tenantId: string, tenderId: string,
  ): Promise<TenderForGlRepostData | null>;

  // ── ACH Domain (3 methods → payments module) ──────────────
  getAchPendingCount(
    tenantId: string,
  ): Promise<number>;

  getAchReturnSummary(
    tenantId: string, startDate: string, endDate: string,
  ): Promise<AchReturnSummaryData>;

  getAchSettlementSummary(
    tenantId: string, startDate: string, endDate: string,
  ): Promise<AchSettlementSummaryData>;
}

// ── Singleton ───────────────────────────────────────────────

// Use globalThis to persist across Next.js HMR module reloads in dev mode
const GLOBAL_KEY = '__oppsera_reconciliation_read_api__' as const;

export function getReconciliationReadApi(): ReconciliationReadApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ReconciliationReadApi | undefined;
  if (!api) throw new Error('ReconciliationReadApi not initialized');
  return api;
}

export function setReconciliationReadApi(api: ReconciliationReadApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}
