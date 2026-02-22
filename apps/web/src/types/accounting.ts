// ── Accounting Types (Session 35) ─────────────────────────────

// ── GL Types ──────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';
export type JournalStatus = 'draft' | 'posted' | 'voided';
export type PeriodStatus = 'open' | 'in_review' | 'closed';

export interface GLAccount {
  id: string;
  accountNumber: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  classificationId: string | null;
  classificationName?: string;
  parentAccountId: string | null;
  isActive: boolean;
  isControlAccount: boolean;
  controlAccountType: string | null;
  isContraAccount: boolean;
  allowManualPosting: boolean;
  description: string | null;
  balance?: number;
}

export interface GLClassification {
  id: string;
  name: string;
  accountType: AccountType;
  sortOrder: number;
}

export interface JournalEntry {
  id: string;
  journalNumber: number;
  sourceModule: string;
  sourceReferenceId: string | null;
  businessDate: string;
  postingPeriod: string;
  currency: string;
  status: JournalStatus;
  memo: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  reversalOfId: string | null;
  createdBy: string;
  createdAt: string;
  lines: JournalLine[];
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountNumber?: string;
  accountName?: string;
  debitAmount: number;
  creditAmount: number;
  locationId: string | null;
  departmentId: string | null;
  customerId: string | null;
  vendorId: string | null;
  memo: string | null;
  sortOrder: number;
}

export type BreakageRecognitionMethod = 'on_expiry' | 'proportional' | 'manual_only';

export interface AccountingSettings {
  tenantId: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  autoPostMode: 'auto_post' | 'draft_only';
  lockPeriodThrough: string | null;
  defaultAPControlAccountId: string | null;
  defaultARControlAccountId: string | null;
  defaultSalesTaxPayableAccountId: string | null;
  defaultUndepositedFundsAccountId: string | null;
  defaultRetainedEarningsAccountId: string | null;
  defaultRoundingAccountId: string | null;
  defaultPmsGuestLedgerAccountId: string | null;
  roundingToleranceCents: number;
  enableCogsPosting: boolean;
  enableInventoryPosting: boolean;
  cogsPostingMode: 'disabled' | 'perpetual' | 'periodic';
  periodicCogsLastCalculatedDate: string | null;
  periodicCogsMethod: string | null;
  postByLocation: boolean;
  enableUndepositedFundsWorkflow: boolean;
  enableLegacyGlPosting: boolean;
  defaultTipsPayableAccountId: string | null;
  defaultServiceChargeRevenueAccountId: string | null;
  defaultCashOverShortAccountId: string | null;
  defaultCompExpenseAccountId: string | null;
  defaultReturnsAccountId: string | null;
  defaultPayrollClearingAccountId: string | null;
  // Multi-currency (ACCT-CLOSE-06)
  supportedCurrencies: string[];
  // Breakage income policy (ACCT-CLOSE-02)
  recognizeBreakageAutomatically: boolean;
  breakageRecognitionMethod: BreakageRecognitionMethod;
  breakageIncomeAccountId: string | null;
  voucherExpiryEnabled: boolean;
}

export interface UnmappedEvent {
  id: string;
  eventType: string;
  sourceModule: string;
  entityType: string;
  entityId: string;
  reason: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  name: string;
  glAccountId: string;
  glAccountNumber?: string;
  glAccountName?: string;
  accountNumberLast4: string | null;
  bankName: string | null;
  isActive: boolean;
  isDefault: boolean;
}

export interface ClosePeriod {
  id: string;
  postingPeriod: string;
  status: PeriodStatus;
  checklist: CloseChecklistItem[];
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
}

export interface CloseChecklistItem {
  label: string;
  status: 'pass' | 'fail' | 'warning';
  detail?: string;
}

// ── GL Mapping Types ──────────────────────────────────────────

export interface SubDepartmentMapping {
  subDepartmentId: string;
  subDepartmentName: string;
  departmentId: string;
  departmentName: string;
  itemCount: number;
  revenueAccountId: string | null;
  revenueAccountDisplay: string | null;
  cogsAccountId: string | null;
  cogsAccountDisplay: string | null;
  inventoryAssetAccountId: string | null;
  inventoryAssetAccountDisplay: string | null;
  discountAccountId: string | null;
  discountAccountDisplay: string | null;
  returnsAccountId: string | null;
  returnsAccountDisplay: string | null;
}

export interface SubDepartmentItem {
  id: string;
  sku: string | null;
  name: string;
  itemType: string;
  categoryName: string;
  defaultPrice: string;
}

export interface PaymentTypeMapping {
  paymentType: string;
  cashBankAccountId: string | null;
  clearingAccountId: string | null;
  feeExpenseAccountId: string | null;
}

export interface TaxGroupMapping {
  taxGroupId: string;
  taxGroupName: string;
  rate: number;
  taxPayableAccountId: string | null;
}

export interface MappingCoverage {
  departments: { mapped: number; total: number };
  paymentTypes: { mapped: number; total: number };
  taxGroups: { mapped: number; total: number };
  overallPercentage: number;
}

// ── Financial Statement Types ─────────────────────────────────

export interface FinancialStatementSection {
  label: string;
  accounts: FinancialStatementLine[];
  subtotal: number;
}

export interface FinancialStatementLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  priorAmount?: number;
}

export interface ProfitAndLoss {
  periodStart: string;
  periodEnd: string;
  sections: FinancialStatementSection[];
  totalRevenue: number;
  grossRevenue: number;
  contraRevenue: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheet {
  asOfDate: string;
  assets: FinancialStatementSection[];
  liabilities: FinancialStatementSection[];
  equity: FinancialStatementSection[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}

export interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;
  operatingActivities: { label: string; amount: number }[];
  netCashFromOperations: number;
  investingActivities: { label: string; amount: number }[];
  netCashFromInvesting: number;
  financingActivities: { label: string; amount: number }[];
  netCashFromFinancing: number;
  netChangeInCash: number;
  beginningCashBalance: number;
  endingCashBalance: number;
}

export interface HealthSummary {
  netIncome: number;
  cashBalance: number;
  apBalance: number;
  arBalance: number;
  workingCapital: number;
  mappingCoverage: MappingCoverage;
  unmappedEventCount: number;
  recentJournals: JournalEntry[];
  currentPeriod: ClosePeriod | null;
}

// ── AP Types ──────────────────────────────────────────────────

export type APBillStatus = 'draft' | 'posted' | 'partial' | 'paid' | 'voided';
export type APPaymentStatus = 'draft' | 'posted' | 'voided';
export type APLineType = 'expense' | 'inventory' | 'asset' | 'freight';

export interface APBill {
  id: string;
  vendorId: string;
  vendorName?: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  paymentTermsId: string | null;
  locationId: string | null;
  memo: string | null;
  totalAmount: string;
  taxAmount: string;
  balanceDue: string;
  status: APBillStatus;
  receiptId: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  lines: APBillLine[];
}

export interface APBillLine {
  id: string;
  lineType: APLineType;
  glAccountId: string;
  glAccountNumber?: string;
  glAccountName?: string;
  description: string | null;
  quantity: string;
  unitCost: string;
  amount: string;
  locationId: string | null;
  departmentId: string | null;
}

export interface APPayment {
  id: string;
  vendorId: string;
  vendorName?: string;
  paymentDate: string;
  paymentMethod: string;
  bankAccountId: string | null;
  referenceNumber: string | null;
  amount: string;
  memo: string | null;
  status: APPaymentStatus;
  postedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  allocations: APPaymentAllocation[];
}

export interface APPaymentAllocation {
  id: string;
  billId: string;
  billNumber?: string;
  amount: string;
}

export interface PaymentTerms {
  id: string;
  name: string;
  dueDays: number;
  discountPercent: string | null;
  discountDays: number | null;
  isActive: boolean;
}

export interface VendorAccounting {
  vendorId: string;
  vendorNumber: string | null;
  defaultExpenseAccountId: string | null;
  defaultAPAccountId: string | null;
  paymentTermsId: string | null;
  is1099Eligible: boolean;
}

// ── AR Types ──────────────────────────────────────────────────

export type ARInvoiceStatus = 'draft' | 'posted' | 'partial' | 'paid' | 'voided';
export type ARReceiptStatus = 'draft' | 'posted' | 'voided';
export type ARSourceType = 'manual' | 'membership' | 'event' | 'pos_house_account';

export interface ARInvoice {
  id: string;
  customerId: string;
  customerName?: string;
  billingAccountId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  sourceType: ARSourceType;
  locationId: string | null;
  memo: string | null;
  totalAmount: string;
  taxAmount: string;
  balanceDue: string;
  status: ARInvoiceStatus;
  postedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  lines: ARInvoiceLine[];
}

export interface ARInvoiceLine {
  id: string;
  revenueAccountId: string;
  revenueAccountNumber?: string;
  revenueAccountName?: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  taxGroupId: string | null;
  taxAmount: string;
}

export interface ARReceipt {
  id: string;
  customerId: string;
  customerName?: string;
  receiptDate: string;
  paymentMethod: string;
  bankAccountId: string | null;
  referenceNumber: string | null;
  amount: string;
  memo: string | null;
  status: ARReceiptStatus;
  postedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  allocations: ARReceiptAllocation[];
}

export interface ARReceiptAllocation {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  amount: string;
}

// ── Report Types ──────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  classificationName: string | null;
  debitBalance: number;
  creditBalance: number;
}

export interface GLDetailRow {
  date: string;
  journalId: string;
  journalNumber: number;
  sourceModule: string;
  memo: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GLSummaryRow {
  groupLabel: string;
  totalDebits: number;
  totalCredits: number;
  netBalance: number;
}

export interface APAgingRow {
  vendorId: string;
  vendorName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface ARAgingRow {
  customerId: string;
  customerName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface SalesTaxRow {
  taxGroupId: string;
  taxGroupName: string;
  jurisdiction: string;
  rate: number;
  taxCollected: number;
  taxRemitted: number;
  netLiability: number;
}

// ── AP Report Types ──────────────────────────────────────────

export interface VendorLedgerRow {
  date: string;
  type: 'bill' | 'payment' | 'credit';
  referenceNumber: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface CashRequirementsRow {
  period: string;
  billCount: number;
  totalDue: number;
  runningTotal: number;
}

export interface Report1099Row {
  vendorId: string;
  vendorName: string;
  vendorNumber: string | null;
  totalPayments: number;
  is1099Eligible: boolean;
}

export interface ExpenseByVendorRow {
  vendorId: string;
  vendorName: string;
  glAccountId: string;
  glAccountNumber: string;
  glAccountName: string;
  total: number;
}

export interface AssetPurchaseRow {
  glAccountId: string;
  glAccountNumber: string;
  glAccountName: string;
  period: string;
  total: number;
}

// ── Settlements ──────────────────────────────────────────────

export interface Settlement {
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

export interface SettlementLine {
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

export interface SettlementDetail extends Omit<Settlement, 'totalLines' | 'matchedLines' | 'unmatchedLines'> {
  updatedAt: string;
  lines: SettlementLine[];
}

export interface UnmatchedTenderItem {
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

export const SETTLEMENT_STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  pending: { label: 'Pending', variant: 'warning' },
  matched: { label: 'Matched', variant: 'info' },
  posted: { label: 'Posted', variant: 'success' },
  disputed: { label: 'Disputed', variant: 'error' },
};

// ── Tip Payouts ─────────────────────────────────────────────

export type TipPayoutStatus = 'pending' | 'completed' | 'voided';
export type TipPayoutType = 'cash' | 'payroll' | 'check';

export interface TipBalanceItem {
  employeeId: string;
  employeeName: string | null;
  totalTipsCents: number;
  totalPaidCents: number;
  balanceCents: number;
  lastTipDate: string | null;
  lastPayoutDate: string | null;
}

export interface TipPayoutItem {
  id: string;
  locationId: string;
  employeeId: string;
  employeeName: string | null;
  payoutType: TipPayoutType;
  amountCents: number;
  businessDate: string;
  drawerSessionId: string | null;
  payrollPeriod: string | null;
  status: TipPayoutStatus;
  approvedBy: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export const TIP_PAYOUT_STATUS_CONFIG: Record<TipPayoutStatus, { label: string; variant: string }> = {
  pending: { label: 'Pending', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  voided: { label: 'Voided', variant: 'error' },
};

export const TIP_PAYOUT_TYPE_CONFIG: Record<TipPayoutType, { label: string }> = {
  cash: { label: 'Cash' },
  payroll: { label: 'Payroll' },
  check: { label: 'Check' },
};

// ── Tax Remittance ───────────────────────────────────────────

export type AuthorityType = 'state' | 'county' | 'city' | 'district';
export type TaxType = 'sales' | 'excise' | 'hospitality' | 'use';
export type FilingFrequency = 'monthly' | 'quarterly' | 'annual';

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

export interface TaxRemittanceReport {
  period: { from: string; to: string };
  locationId: string | null;
  rows: TaxRemittanceRow[];
  totalTaxableSalesCents: number;
  totalTaxCollectedCents: number;
  totalExemptSalesCents: number;
}

export const AUTHORITY_TYPE_CONFIG: Record<AuthorityType, { label: string }> = {
  state: { label: 'State' },
  county: { label: 'County' },
  city: { label: 'City' },
  district: { label: 'District' },
};

export const TAX_TYPE_CONFIG: Record<TaxType, { label: string }> = {
  sales: { label: 'Sales Tax' },
  excise: { label: 'Excise Tax' },
  hospitality: { label: 'Hospitality Tax' },
  use: { label: 'Use Tax' },
};

export const FILING_FREQUENCY_CONFIG: Record<FilingFrequency, { label: string }> = {
  monthly: { label: 'Monthly' },
  quarterly: { label: 'Quarterly' },
  annual: { label: 'Annual' },
};

// ── COGS Types ──────────────────────────────────────────────

export type CogsPostingMode = 'disabled' | 'perpetual' | 'periodic';
export type CogsCalculationMethod = 'weighted_average' | 'fifo' | 'standard';

export interface PeriodicCogsCalculation {
  id: string;
  locationId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  calculationMethod: string;
  beginningInventoryDollars: string;
  purchasesDollars: string;
  endingInventoryDollars: string;
  cogsDollars: string;
  glJournalEntryId: string | null;
  calculatedAt: string;
  postedAt: string | null;
  postedBy: string | null;
}

export interface CogsComparison {
  periodStart: string;
  periodEnd: string;
  perpetualCogsDollars: string;
  periodicCogsDollars: string | null;
  varianceDollars: string | null;
  variancePercent: string | null;
}

export const COGS_MODE_CONFIG: Record<CogsPostingMode, { label: string; description: string }> = {
  disabled: { label: 'Disabled', description: 'No COGS posting' },
  perpetual: { label: 'Perpetual', description: 'COGS posted per-tender at time of sale' },
  periodic: { label: 'Periodic', description: 'COGS calculated at period-end (Beginning + Purchases − Ending)' },
};

export const COGS_METHOD_CONFIG: Record<CogsCalculationMethod, { label: string }> = {
  weighted_average: { label: 'Weighted Average' },
  fifo: { label: 'FIFO' },
  standard: { label: 'Standard Cost' },
};

// ── Helpers ───────────────────────────────────────────────────

/** Format a dollar amount (NUMERIC from GL/AP/AR) as USD currency string */
export function formatAccountingMoney(dollars: number | string): string {
  const num = typeof dollars === 'string' ? Number(dollars) : dollars;
  if (isNaN(num)) return '$0.00';
  if (num < 0) {
    return `($${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** F&B category mapping coverage */
export interface FnbCategoryMappingStatus {
  key: string;
  label: string;
  description: string;
  critical: boolean;
  isMapped: boolean;
  accountId: string | null;
  accountName: string | null;
}

export interface FnbMappingCoverageResult {
  locationId: string;
  categories: FnbCategoryMappingStatus[];
  mappedCount: number;
  totalCount: number;
  criticalMappedCount: number;
  criticalTotalCount: number;
  coveragePercent: number;
}

// ── Deposit Slips ────────────────────────────────────────────

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

export interface DepositSlipItem {
  id: string;
  tenantId: string;
  locationId: string;
  businessDate: string;
  depositType: string;
  totalAmountCents: number;
  bankAccountId: string | null;
  status: string;
  retailCloseBatchIds: string[];
  fnbCloseBatchId: string | null;
  // ACCT-CLOSE-01: deposit prep enhancements
  denominationBreakdown: DenominationBreakdown | null;
  slipNumber: string | null;
  preparedBy: string | null;
  preparedAt: string | null;
  depositedAt: string | null;
  depositedBy: string | null;
  reconciledAt: string | null;
  reconciledBy: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Location Close Status ────────────────────────────────────

export interface TerminalCloseStatusItem {
  terminalId: string;
  terminalName: string | null;
  drawerSessionStatus: string | null;
  closeBatchStatus: string | null;
  closeBatchId: string | null;
}

export interface LocationCloseStatusResult {
  locationId: string;
  businessDate: string;
  retailTerminals: TerminalCloseStatusItem[];
  fnbBatchStatus: string | null;
  fnbBatchId: string | null;
  depositSlipId: string | null;
  depositSlipStatus: string | null;
  allTerminalsClosed: boolean;
  fnbClosed: boolean;
  depositReady: boolean;
}

// ── UXOPS-13 Operations Dashboard Types ────────────────────

export interface ActiveDrawerSessionItem {
  id: string;
  terminalId: string;
  employeeId: string;
  employeeName: string | null;
  openedAt: string;
  openingBalanceCents: number;
  cashInCents: number;
  cashOutCents: number;
  dropsCents: number;
}

export interface CashManagementDashboardResult {
  activeSessions: ActiveDrawerSessionItem[];
  cashSummary: {
    totalOpeningCents: number;
    totalCashInCents: number;
    totalCashOutCents: number;
    totalCashDropsCents: number;
    expectedCashOnHandCents: number;
  };
  pendingDeposits: number;
  outstandingTipsCents: number;
  overShortCents: number;
}

export interface TenderAuditTrailStep {
  stage: string;
  label: string;
  status: 'complete' | 'pending' | 'missing';
  timestamp: string | null;
  referenceId: string | null;
  detail?: string;
}

export interface TenderAuditTrailResult {
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

export interface DailyReconciliationResult {
  businessDate: string;
  locationId: string;
  sales: {
    grossSalesCents: number;
    discountsCents: number;
    netSalesCents: number;
    taxCents: number;
    serviceChargeCents: number;
    tipsCents: number;
    totalCents: number;
    orderCount: number;
    voidCount: number;
    voidAmountCents: number;
  };
  tenders: {
    cashCents: number;
    cardCents: number;
    otherCents: number;
    totalCents: number;
    tenderCount: number;
  };
  gl: {
    revenueDebitsCents: number;
    revenueCreditsCents: number;
    totalDebitsDollars: string;
    totalCreditsDollars: string;
    isBalanced: boolean;
  };
  reconciliation: {
    salesVsTendersDiffCents: number;
    status: 'balanced' | 'difference';
  };
}

export interface OperationsSummaryResult {
  totalSalesCents: number;
  orderCount: number;
  avgTicketCents: number;
  voidRate: number;
  discountRate: number;
  compRate: number;
  overShortCents: number;
  cashOnHandCents: number;
  outstandingTipsCents: number;
  pendingSettlements: number;
  activeDrawerSessions: number;
}

// ── Recurring Templates ──────────────────────────────────────

export type RecurringFrequency = 'monthly' | 'quarterly' | 'annually';

export interface RecurringTemplateLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  memo?: string;
}

export interface RecurringTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  frequency: RecurringFrequency;
  dayOfPeriod: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastPostedPeriod: string | null;
  nextDueDate: string | null;
  templateLines: RecurringTemplateLine[];
  sourceModule: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTemplateHistoryEntry {
  id: string;
  journalNumber: number;
  businessDate: string;
  status: string;
  postedAt: string | null;
}

export const RECURRING_FREQUENCY_CONFIG: Record<RecurringFrequency, { label: string }> = {
  monthly: { label: 'Monthly' },
  quarterly: { label: 'Quarterly' },
  annually: { label: 'Annually' },
};

// ── Breakage Review Types ────────────────────────────────────

export type BreakageReviewStatus = 'pending' | 'approved' | 'declined';

export interface BreakageReviewItem {
  id: string;
  tenantId: string;
  voucherId: string;
  voucherNumber: string;
  amountCents: number;
  expiredAt: string;
  status: BreakageReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  glJournalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BreakageReviewStats {
  pendingCount: number;
  pendingAmountCents: number;
}

export const BREAKAGE_STATUS_CONFIG: Record<BreakageReviewStatus, { label: string; variant: string }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  declined: { label: 'Declined', variant: 'error' },
};

export const BREAKAGE_METHOD_CONFIG: Record<BreakageRecognitionMethod, { label: string; description: string }> = {
  on_expiry: { label: 'On Expiry', description: 'Recognize full balance when voucher expires' },
  proportional: { label: 'Proportional', description: 'Recognize over voucher life (GAAP preferred)' },
  manual_only: { label: 'Manual Only', description: 'Never auto-recognize; queue for manual review' },
};

// ── Reconciliation Waterfall ─────────────────────────────────

export interface WaterfallStage {
  stage: string;
  label: string;
  amount: number;      // cents
  expected: number | null;
  variance: number | null;
  indent: number;       // 0 = top-level, 1 = sub-item
  drillType: string | null;
}

export interface ReconciliationWaterfall {
  businessDate: string;
  locationId: string | null;
  stages: WaterfallStage[];
  totalVariance: number;
  isBalanced: boolean;
}

// ── Bank Reconciliation ──────────────────────────────────────

export type BankReconciliationStatus = 'in_progress' | 'completed';

export interface BankReconciliationListItem {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  glAccountNumber: string;
  statementDate: string;
  statementEndingBalance: string;
  beginningBalance: string;
  difference: string;
  status: BankReconciliationStatus;
  reconciledBy: string | null;
  completedAt: string | null;
  itemCount: number;
  clearedCount: number;
  createdAt: string;
}

export interface BankReconciliationItem {
  id: string;
  reconciliationId: string;
  glJournalLineId: string | null;
  itemType: string;
  amount: string;
  date: string;
  description: string | null;
  isCleared: boolean;
  clearedDate: string | null;
  glJournalEntryId: string | null;
  journalNumber: number | null;
  journalMemo: string | null;
  sourceModule: string | null;
  createdAt: string;
}

export interface BankReconciliationDetail {
  id: string;
  tenantId: string;
  bankAccountId: string;
  bankAccountName: string | null;
  glAccountId: string | null;
  statementDate: string;
  statementEndingBalance: string;
  beginningBalance: string;
  status: string;
  clearedBalance: string;
  outstandingDeposits: string;
  outstandingWithdrawals: string;
  adjustmentTotal: string;
  difference: string;
  reconciledBy: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: BankReconciliationItem[];
}

export const BANK_REC_STATUS_CONFIG: Record<BankReconciliationStatus, { label: string; variant: string }> = {
  in_progress: { label: 'In Progress', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
};

export const BANK_REC_ITEM_TYPE_CONFIG: Record<string, { label: string }> = {
  deposit: { label: 'Deposit' },
  withdrawal: { label: 'Withdrawal' },
  fee: { label: 'Bank Fee' },
  interest: { label: 'Interest' },
  adjustment: { label: 'Adjustment' },
};

/** Source module display config */
export const SOURCE_MODULE_BADGES: Record<string, { label: string; variant: string }> = {
  manual: { label: 'Manual', variant: 'info' },
  pos: { label: 'POS', variant: 'success' },
  ap: { label: 'AP', variant: 'purple' },
  ar: { label: 'AR', variant: 'orange' },
  inventory: { label: 'Inventory', variant: 'indigo' },
  pos_legacy: { label: 'Legacy', variant: 'neutral' },
};

/** Status → badge variant mapping for accounting statuses */
export const ACCOUNTING_STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  draft: { label: 'Draft', variant: 'neutral' },
  posted: { label: 'Posted', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  paid: { label: 'Paid', variant: 'info' },
  voided: { label: 'Voided', variant: 'error' },
  open: { label: 'Open', variant: 'info' },
  in_review: { label: 'In Review', variant: 'warning' },
  closed: { label: 'Closed', variant: 'success' },
};
