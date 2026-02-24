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
export { createSettlement } from './commands/create-settlement';
export { importSettlementCsv } from './commands/import-settlement-csv';
export { matchSettlementTenders } from './commands/match-settlement-tenders';
export { postSettlement } from './commands/post-settlement';
export { voidSettlement } from './commands/void-settlement';
export { createTipPayout } from './commands/create-tip-payout';
export { voidTipPayout } from './commands/void-tip-payout';
export { calculatePeriodicCogs } from './commands/calculate-periodic-cogs';
export type { PeriodicCogsCalculation } from './commands/calculate-periodic-cogs';
export { postPeriodicCogs } from './commands/post-periodic-cogs';
export { reviewBreakage } from './commands/review-breakage';
export type { BreakageReviewItem } from './commands/review-breakage';
export {
  createRecurringTemplate,
  updateRecurringTemplate,
  deactivateRecurringTemplate,
  executeRecurringTemplate,
  executeDueRecurringEntries,
} from './commands/manage-recurring-templates';
export type { RecurringTemplate, TemplateLine } from './commands/manage-recurring-templates';
export {
  startBankReconciliation,
  clearReconciliationItems,
  addBankAdjustment,
  completeBankReconciliation,
} from './commands/manage-bank-reconciliation';
export type { BankReconciliation, BankReconciliationItem } from './commands/manage-bank-reconciliation';
export { importCoaFromCsv } from './commands/import-coa-from-csv';
export { mergeGlAccounts } from './commands/merge-gl-accounts';
export { renumberGlAccount } from './commands/renumber-gl-account';
export { remapGlForTender, batchRemapGlForTenders } from './commands/remap-gl-for-tender';
export type { RemapResult } from './commands/remap-gl-for-tender';
export { runCloseOrchestrator } from './commands/run-close-orchestrator';
export type { CloseOrchestratorRunResult, StepResult } from './commands/run-close-orchestrator';
export { createTenantTenderType } from './commands/create-tenant-tender-type';
export { updateTenantTenderType } from './commands/update-tenant-tender-type';
export { deactivateTenderType } from './commands/deactivate-tender-type';

// Queries (COA)
export { getCoaHealth } from './queries/get-coa-health';
export type { CoaHealthReport } from './queries/get-coa-health';
export { listGlClassifications } from './queries/list-gl-classifications';
export type { GlClassificationListItem } from './queries/list-gl-classifications';
export { listCoaImportLogs } from './queries/list-coa-import-logs';
export type { CoaImportLogItem } from './queries/list-coa-import-logs';

// Adapters
export { handleTenderForAccounting } from './adapters/pos-posting-adapter';
export { handleOrderVoidForAccounting } from './adapters/void-posting-adapter';
export { handleFolioChargeForAccounting } from './adapters/folio-posting-adapter';
export { handleLoyaltyRedemptionForAccounting } from './adapters/loyalty-posting-adapter';
export { handleDepositAuthorizedForAccounting, handleDepositCapturedForAccounting } from './adapters/deposit-posting-adapter';
export { handleOrderReturnForAccounting } from './adapters/return-posting-adapter';
export { handleFnbGlPostingForAccounting } from './adapters/fnb-posting-adapter';
export { handleVoucherPurchaseForAccounting, handleVoucherRedemptionForAccounting, handleVoucherExpirationForAccounting } from './adapters/voucher-posting-adapter';
export { handleMembershipBillingForAccounting } from './adapters/membership-posting-adapter';
export { handleChargebackReceivedForAccounting, handleChargebackResolvedForAccounting } from './adapters/chargeback-posting-adapter';
export { handleAchReturnForAccounting } from './adapters/ach-return-posting-adapter';
export {
  handleAchOriginatedForAccounting,
  handleAchSettledForAccounting,
  handleAchReturnGlReversal,
} from './adapters/ach-posting-adapter';
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
export { listSettlements } from './queries/list-settlements';
export type { SettlementListItem } from './queries/list-settlements';
export { getSettlement } from './queries/get-settlement';
export type { SettlementDetail, SettlementLineDetail } from './queries/get-settlement';
export { getUnmatchedTenders } from './queries/get-unmatched-tenders';
export type { UnmatchedTender } from './queries/get-unmatched-tenders';
export { getTipBalances } from './queries/get-tip-balances';
export type { TipBalanceItem } from './queries/get-tip-balances';
export { listTipPayouts } from './queries/list-tip-payouts';
export type { TipPayoutItem, ListTipPayoutsResult } from './queries/list-tip-payouts';
export { getTaxRemittanceReport } from './queries/get-tax-remittance-report';
export type { TaxRemittanceRow, TaxRemittanceReport } from './queries/get-tax-remittance-report';
export { getTaxRateBreakdown } from './queries/get-tax-rate-breakdown';
export type { TaxRateBreakdownRow, TaxRateBreakdown } from './queries/get-tax-rate-breakdown';
export { listPeriodicCogs } from './queries/list-periodic-cogs';
export type { PeriodicCogsListItem, ListPeriodicCogsResult } from './queries/list-periodic-cogs';
export { getCogsComparison } from './queries/get-cogs-comparison';
export type { CogsComparisonResult } from './queries/get-cogs-comparison';
export { getFnbMappingCoverage } from './queries/get-fnb-mapping-coverage';
export type { FnbCategoryMappingStatus, FnbMappingCoverageResult } from './queries/get-fnb-mapping-coverage';
export { getLocationCloseStatus } from './queries/get-location-close-status';
export type { LocationCloseStatus, TerminalCloseStatus } from './queries/get-location-close-status';
export { listDepositSlips, getDepositSlip } from './queries/list-deposit-slips';
export { createDepositSlip, prepareDepositSlip, markDeposited, reconcileDeposit } from './commands/manage-deposit-slips';
export type { DepositSlip, CreateDepositSlipInput, PrepareDepositSlipInput } from './commands/manage-deposit-slips';
export { getCashManagementDashboard } from './queries/get-cash-management-dashboard';
export type { CashManagementDashboard, ActiveDrawerSession } from './queries/get-cash-management-dashboard';
export { getTenderAuditTrail } from './queries/get-tender-audit-trail';
export type { TenderAuditTrail, TenderAuditTrailStep } from './queries/get-tender-audit-trail';
export { getDailyReconciliation } from './queries/get-daily-reconciliation';
export type { DailyReconciliation } from './queries/get-daily-reconciliation';
export { getOperationsSummary } from './queries/get-operations-summary';
export type { OperationsSummary } from './queries/get-operations-summary';
export { getAuditCoverage } from './queries/get-audit-coverage';
export type { AuditCoverageReport, AuditCoverageItem } from './queries/get-audit-coverage';
export { listPendingBreakage, getPendingBreakageStats } from './queries/list-pending-breakage';
export type { ListPendingBreakageInput } from './queries/list-pending-breakage';
export { listRecurringTemplates, getRecurringTemplate, getRecurringTemplateHistory } from './queries/list-recurring-templates';
export type { ListRecurringTemplatesInput } from './queries/list-recurring-templates';
export { getReconciliationWaterfall } from './queries/get-reconciliation-waterfall';
export type { WaterfallStage, ReconciliationWaterfall } from './queries/get-reconciliation-waterfall';
export { listBankReconciliations, getBankReconciliation } from './queries/list-bank-reconciliations';
export type { BankReconciliationListItem, BankReconciliationDetail } from './queries/list-bank-reconciliations';
export { getRemappableTenders } from './queries/get-remappable-tenders';
export type { RemappableTender, MissingMapping } from './queries/get-remappable-tenders';
export { getTransactionTypeMappings } from './queries/get-transaction-type-mappings';
export type { TransactionTypeMappingRow } from './queries/get-transaction-type-mappings';
export { getCloseOrchestratorRun, listCloseOrchestratorRuns, getLastCloseRun } from './queries/get-close-orchestrator-run';
export type { CloseOrchestratorRun, CloseOrchestratorRunListItem, ListCloseOrchestratorRunsResult } from './queries/get-close-orchestrator-run';

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
export { tryAutoRemap } from './helpers/try-auto-remap';
export type { AutoRemapResult } from './helpers/try-auto-remap';
export { resolveRevenueAccountForSubDepartment, expandPackageForGL } from './helpers/catalog-gl-resolution';

// Services
export {
  replaceStatePlaceholder,
  convertHardcodedStateToPlaceholder,
  applyStatePlaceholders,
  detectAndConvertStates,
  resolveState,
  isValidStateName,
  STATE_PLACEHOLDER,
} from './services/state-placeholder';

// Validation & Hierarchy
export {
  validateFullCoa,
  validateSingleAccount,
  validateMerge,
  validateDeactivation,
} from './services/coa-validation';
export type { ValidationError, GLAccountForValidation } from './services/coa-validation';
export {
  computeDepth,
  computePath,
  detectCircularReference,
  getDescendants,
  recomputeHierarchyFields,
} from './services/hierarchy-helpers';
export type { AccountNode } from './services/hierarchy-helpers';
export {
  logAccountChange,
  computeAccountDiff,
  getAccountChangeLog,
} from './services/account-change-log';
export type { ChangeLogEntry, LogAccountChangeParams } from './services/account-change-log';

// CSV Import
export { parseCsvImport } from './services/csv-import';
export type { ParsedAccount, CsvValidationMessage, CsvValidationResult } from './services/csv-import';

// Intelligent COA Import
export {
  analyzeFile,
  reanalyzeWithOverrides,
  executeImport,
  parseFile,
  detectFormat,
  detectColumns,
  inferAccountType,
  detectHierarchy,
  validateAccounts,
  getConfidenceLevel,
} from './services/coa-import';
export type {
  FileFormat,
  ParsedFile,
  TargetField,
  ColumnMapping,
  ConfidenceLevel,
  AccountType,
  NormalBalance,
  TypeInference,
  TypeSignal,
  HierarchyStrategy,
  HierarchyDetectionResult,
  HierarchyResultSerialized,
  AccountPreview,
  IssueSeverity,
  IssueCode,
  PreviewIssue,
  IssueResolution,
  ValidationSummary,
  AnalysisResult,
  ImportOptions,
  ImportExecutionResult,
} from './services/coa-import';

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
  createSettlementSchema,
  importSettlementCsvSchema,
  matchSettlementTendersSchema,
  postSettlementSchema,
  voidSettlementSchema,
  createTipPayoutSchema,
  voidTipPayoutSchema,
  listTipPayoutsSchema,
  calculatePeriodicCogsSchema,
  postPeriodicCogsSchema,
  listPeriodicCogsSchema,
  reviewBreakageSchema,
  listPendingBreakageSchema,
  createRecurringTemplateSchema,
  updateRecurringTemplateSchema,
  executeRecurringTemplateSchema,
  listRecurringTemplatesSchema,
  startBankReconciliationSchema,
  clearReconciliationItemsSchema,
  addBankAdjustmentSchema,
  completeBankReconciliationSchema,
  listBankReconciliationsSchema,
  importCoaFromCsvSchema,
  validateCsvPreviewSchema,
  mergeGlAccountsSchema,
  renumberGlAccountSchema,
  remapGlForTenderSchema,
  batchRemapSchema,
  createTenantTenderTypeSchema,
  updateTenantTenderTypeSchema,
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
  CreateSettlementInput,
  ImportSettlementCsvInput,
  MatchSettlementTendersInput,
  PostSettlementInput,
  VoidSettlementInput,
  CreateTipPayoutInput,
  VoidTipPayoutInput,
  ListTipPayoutsInput,
  CalculatePeriodicCogsInput,
  PostPeriodicCogsInput,
  ListPeriodicCogsInput,
  ReviewBreakageInput,
  ListPendingBreakageInput as ListPendingBreakageValidationInput,
  CreateRecurringTemplateInput,
  UpdateRecurringTemplateInput,
  ExecuteRecurringTemplateInput,
  ListRecurringTemplatesInput as ListRecurringTemplatesValidationInput,
  StartBankReconciliationInput,
  ClearReconciliationItemsInput,
  AddBankAdjustmentInput,
  CompleteBankReconciliationInput,
  ListBankReconciliationsInput,
  ImportCoaFromCsvInput,
  ValidateCsvPreviewInput,
  MergeGlAccountsInput,
  RenumberGlAccountInput,
  RemapGlForTenderInput,
  BatchRemapInput,
  CreateTenantTenderTypeInput,
  UpdateTenantTenderTypeInput,
} from './validation';
