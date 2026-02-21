// Module metadata
export const MODULE_KEY = 'accounting' as const;
export const MODULE_NAME = 'Accounting & GL';
export const MODULE_VERSION = '0.0.0';

// Commands
export { postJournalEntry } from './commands/post-journal-entry';
export { postDraftEntry } from './commands/post-draft-entry';
export { voidJournalEntry } from './commands/void-journal-entry';
export { updateAccountingSettings } from './commands/update-accounting-settings';
export { lockAccountingPeriod } from './commands/lock-accounting-period';
export { createGlAccount } from './commands/create-gl-account';
export { updateGlAccount } from './commands/update-gl-account';
export { createGlClassification } from './commands/create-gl-classification';
export { updateGlClassification } from './commands/update-gl-classification';
export { saveSubDepartmentDefaults } from './commands/save-sub-department-defaults';
export { savePaymentTypeDefaults } from './commands/save-payment-type-defaults';
export { saveTaxGroupDefaults } from './commands/save-tax-group-defaults';
export { saveBankAccount } from './commands/save-bank-account';
export { bootstrapTenantAccounting } from './commands/bootstrap-tenant-accounting';
export { updateClosePeriod } from './commands/update-close-period';
export { closeAccountingPeriod } from './commands/close-accounting-period';
export { saveStatementLayout } from './commands/save-statement-layout';
export { generateRetainedEarnings } from './commands/generate-retained-earnings';

// Adapters
export { handleTenderForAccounting } from './adapters/pos-posting-adapter';
export { handleFolioChargeForAccounting } from './adapters/folio-posting-adapter';
export { migrateLegacyJournalEntries } from './adapters/legacy-bridge-adapter';

// Queries
export { getAccountBalances } from './queries/get-account-balances';
export type { AccountBalance } from './queries/get-account-balances';
export { getJournalEntry } from './queries/get-journal-entry';
export { listJournalEntries } from './queries/list-journal-entries';
export { listGlAccounts } from './queries/list-gl-accounts';
export type { GlAccountListItem } from './queries/list-gl-accounts';
export { getTrialBalance } from './queries/get-trial-balance';
export type { TrialBalanceAccount, TrialBalanceReport } from './queries/get-trial-balance';
export { getGlDetailReport } from './queries/get-gl-detail-report';
export type { GlDetailLine } from './queries/get-gl-detail-report';
export { getGlSummary } from './queries/get-gl-summary';
export type { GlSummaryClassification, GlSummaryReport } from './queries/get-gl-summary';
export { listUnmappedEvents } from './queries/list-unmapped-events';
export type { UnmappedEvent } from './queries/list-unmapped-events';
export { reconcileSubledger } from './queries/reconcile-subledger';
export type { ReconciliationResult, ReconciliationDetail } from './queries/reconcile-subledger';
export { listBankAccounts } from './queries/list-bank-accounts';
export type { BankAccount } from './queries/list-bank-accounts';
export { getMappingCoverage } from './queries/get-mapping-coverage';
export type { MappingCoverageReport, MappingCoverageDetail } from './queries/get-mapping-coverage';
export { getSubDepartmentMappings } from './queries/get-sub-department-mappings';
export type { SubDepartmentMappingRow } from './queries/get-sub-department-mappings';
export { getItemsBySubDepartment } from './queries/get-items-by-sub-department';
export type { SubDepartmentItem } from './queries/get-items-by-sub-department';
export { getCloseChecklist } from './queries/get-close-checklist';
export type { CloseChecklist, CloseChecklistItem } from './queries/get-close-checklist';
export { listClosePeriods } from './queries/list-close-periods';
export type { ClosePeriodItem, ListClosePeriodsResult } from './queries/list-close-periods';
export { getProfitAndLoss } from './queries/get-profit-and-loss';
export type { ProfitAndLoss, PnlSection, PnlAccountLine } from './queries/get-profit-and-loss';
export { getBalanceSheet } from './queries/get-balance-sheet';
export type { BalanceSheet, BsSection, BsAccountLine } from './queries/get-balance-sheet';
export { getSalesTaxLiability } from './queries/get-sales-tax-liability';
export type { SalesTaxLiability, SalesTaxGroupRow } from './queries/get-sales-tax-liability';
export { getCashFlowSimplified } from './queries/get-cash-flow-simplified';
export type { CashFlowSimplified } from './queries/get-cash-flow-simplified';
export { getPeriodComparison } from './queries/get-period-comparison';
export type { PeriodComparison, PeriodComparisonLine } from './queries/get-period-comparison';
export { getFinancialHealthSummary } from './queries/get-financial-health-summary';
export type { FinancialHealthSummary } from './queries/get-financial-health-summary';
export { listStatementLayouts } from './queries/list-statement-layouts';
export type { StatementLayoutItem } from './queries/list-statement-layouts';

// Helpers
export { resolveNormalBalance } from './helpers/resolve-normal-balance';
export { generateJournalNumber } from './helpers/generate-journal-number';
export { validateJournal } from './helpers/validate-journal';
export type { JournalLineInput } from './helpers/validate-journal';
export { bootstrapTenantCoa } from './helpers/bootstrap-tenant-coa';
export {
  resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts,
  resolveTaxGroupAccount,
  resolveFolioEntryTypeAccount,
  logUnmappedEvent,
} from './helpers/resolve-mapping';
export type {
  SubDeptGL,
  PaymentTypeGL,
  UnmappedEventParams,
} from './helpers/resolve-mapping';
export { getAccountingSettings } from './helpers/get-accounting-settings';
export type { AccountingSettings } from './helpers/get-accounting-settings';
export { resolveRevenueAccountForSubDepartment, expandPackageForGL } from './helpers/catalog-gl-resolution';

// Errors
export {
  UnbalancedJournalError,
  PeriodLockedError,
  ImmutableEntryError,
  ControlAccountError,
  MissingMappingError,
  CurrencyMismatchError,
} from './errors';

// Event types
export { ACCOUNTING_EVENTS } from './events/types';
export type {
  JournalPostedPayload,
  JournalVoidedPayload,
  PeriodLockedPayload,
  PostingSkippedPayload,
  PeriodClosedPayload,
} from './events/types';

// Validation schemas
export {
  postJournalEntrySchema,
  postDraftEntrySchema,
  voidJournalEntrySchema,
  updateAccountingSettingsSchema,
  lockAccountingPeriodSchema,
  createGlAccountSchema,
  createGlClassificationSchema,
  updateGlAccountSchema,
  updateGlClassificationSchema,
  saveSubDepartmentDefaultsSchema,
  savePaymentTypeDefaultsSchema,
  saveTaxGroupDefaultsSchema,
  saveBankAccountSchema,
  saveStatementLayoutSchema,
  generateRetainedEarningsSchema,
} from './validation';
export type {
  PostJournalEntryInput,
  UpdateAccountingSettingsInput,
  CreateGlAccountInput,
  CreateGlClassificationInput,
  UpdateGlAccountInput,
  UpdateGlClassificationInput,
  SaveSubDepartmentDefaultsInput,
  SavePaymentTypeDefaultsInput,
  SaveTaxGroupDefaultsInput,
  SaveBankAccountInput,
  SaveStatementLayoutInput,
  GenerateRetainedEarningsInput,
} from './validation';
