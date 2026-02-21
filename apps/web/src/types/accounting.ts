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
  roundingToleranceCents: number;
  enableCogsPosting: boolean;
  enableInventoryPosting: boolean;
  postByLocation: boolean;
  enableUndepositedFundsWorkflow: boolean;
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
  departmentName: string;
  revenueAccountId: string | null;
  cogsAccountId: string | null;
  inventoryAssetAccountId: string | null;
  discountAccountId: string | null;
  returnsAccountId: string | null;
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
