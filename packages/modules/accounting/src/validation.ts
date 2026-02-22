import { z } from 'zod';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

export const journalLineSchema = z.object({
  accountId: z.string().min(1),
  debitAmount: z.string().optional().default('0'),
  creditAmount: z.string().optional().default('0'),
  locationId: z.string().optional(),
  departmentId: z.string().optional(),
  customerId: z.string().optional(),
  vendorId: z.string().optional(),
  profitCenterId: z.string().optional(),
  subDepartmentId: z.string().optional(),
  terminalId: z.string().optional(),
  channel: z.string().optional(),
  memo: z.string().optional(),
});

export const postJournalEntrySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceModule: z.string().min(1),
  sourceReferenceId: z.string().optional(),
  memo: z.string().optional(),
  currency: z.string().optional(),
  lines: z.array(journalLineSchema).min(1),
  forcePost: z.boolean().optional().default(false),
});

export type PostJournalEntryInput = z.input<typeof postJournalEntrySchema>;

export const postDraftEntrySchema = z.object({
  entryId: z.string().min(1),
});

export const voidJournalEntrySchema = z.object({
  entryId: z.string().min(1),
  reason: z.string().min(1),
});

export const updateAccountingSettingsSchema = z.object({
  baseCurrency: z.string().optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  autoPostMode: z.enum(['auto_post', 'draft_only']).optional(),
  defaultAPControlAccountId: z.string().nullable().optional(),
  defaultARControlAccountId: z.string().nullable().optional(),
  defaultSalesTaxPayableAccountId: z.string().nullable().optional(),
  defaultUndepositedFundsAccountId: z.string().nullable().optional(),
  defaultRetainedEarningsAccountId: z.string().nullable().optional(),
  defaultRoundingAccountId: z.string().nullable().optional(),
  roundingToleranceCents: z.number().int().min(0).max(100).optional(),
  enableCogsPosting: z.boolean().optional(),
  enableInventoryPosting: z.boolean().optional(),
  postByLocation: z.boolean().optional(),
  enableUndepositedFundsWorkflow: z.boolean().optional(),
  enableLegacyGlPosting: z.boolean().optional(),
  defaultTipsPayableAccountId: z.string().nullable().optional(),
  defaultServiceChargeRevenueAccountId: z.string().nullable().optional(),
  defaultCashOverShortAccountId: z.string().nullable().optional(),
  defaultCompExpenseAccountId: z.string().nullable().optional(),
  defaultReturnsAccountId: z.string().nullable().optional(),
  defaultPayrollClearingAccountId: z.string().nullable().optional(),
  cogsPostingMode: z.enum(['disabled', 'perpetual', 'periodic']).optional(),
  periodicCogsMethod: z.enum(['weighted_average', 'fifo', 'standard']).nullable().optional(),
  // Breakage income policy
  recognizeBreakageAutomatically: z.boolean().optional(),
  breakageRecognitionMethod: z.enum(['on_expiry', 'proportional', 'manual_only']).optional(),
  breakageIncomeAccountId: z.string().nullable().optional(),
  voucherExpiryEnabled: z.boolean().optional(),
});

export type UpdateAccountingSettingsInput = z.input<typeof updateAccountingSettingsSchema>;

export const lockAccountingPeriodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'),
});

export const createGlAccountSchema = z.object({
  accountNumber: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  accountType: z.enum(ACCOUNT_TYPES),
  classificationId: z.string().optional(),
  parentAccountId: z.string().optional(),
  isControlAccount: z.boolean().optional().default(false),
  controlAccountType: z.enum(['ap', 'ar', 'sales_tax', 'undeposited_funds', 'bank']).nullable().optional(),
  isContraAccount: z.boolean().optional().default(false),
  allowManualPosting: z.boolean().optional().default(true),
  description: z.string().optional(),
});

export type CreateGlAccountInput = z.input<typeof createGlAccountSchema>;

export const createGlClassificationSchema = z.object({
  name: z.string().min(1).max(200),
  accountType: z.enum(ACCOUNT_TYPES),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateGlClassificationInput = z.input<typeof createGlClassificationSchema>;

export const updateGlAccountSchema = z.object({
  accountNumber: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  classificationId: z.string().nullable().optional(),
  parentAccountId: z.string().nullable().optional(),
  isControlAccount: z.boolean().optional(),
  controlAccountType: z.enum(['ap', 'ar', 'sales_tax', 'undeposited_funds', 'bank']).nullable().optional(),
  isContraAccount: z.boolean().optional(),
  allowManualPosting: z.boolean().optional(),
  isActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export type UpdateGlAccountInput = z.input<typeof updateGlAccountSchema>;

export const updateGlClassificationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateGlClassificationInput = z.input<typeof updateGlClassificationSchema>;

export const saveSubDepartmentDefaultsSchema = z.object({
  revenueAccountId: z.string().nullable().optional(),
  cogsAccountId: z.string().nullable().optional(),
  inventoryAssetAccountId: z.string().nullable().optional(),
  discountAccountId: z.string().nullable().optional(),
  returnsAccountId: z.string().nullable().optional(),
  compAccountId: z.string().nullable().optional(),
});

export type SaveSubDepartmentDefaultsInput = z.input<typeof saveSubDepartmentDefaultsSchema>;

export const savePaymentTypeDefaultsSchema = z.object({
  cashAccountId: z.string().nullable().optional(),
  clearingAccountId: z.string().nullable().optional(),
  feeExpenseAccountId: z.string().nullable().optional(),
});

export type SavePaymentTypeDefaultsInput = z.input<typeof savePaymentTypeDefaultsSchema>;

export const saveTaxGroupDefaultsSchema = z.object({
  taxPayableAccountId: z.string().nullable().optional(),
});

export type SaveTaxGroupDefaultsInput = z.input<typeof saveTaxGroupDefaultsSchema>;

export const saveBankAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  glAccountId: z.string().min(1),
  accountNumberLast4: z.string().max(4).nullable().optional(),
  bankName: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
});

export type SaveBankAccountInput = z.input<typeof saveBankAccountSchema>;

export const saveStatementLayoutSchema = z.object({
  id: z.string().optional(), // if present, update; if absent, create
  statementType: z.enum(['profit_loss', 'balance_sheet']),
  name: z.string().min(1).max(200),
  sections: z.array(z.object({
    label: z.string().min(1),
    classificationIds: z.array(z.string()).optional().default([]),
    accountIds: z.array(z.string()).optional().default([]),
    subtotalLabel: z.string().optional(),
    isTotal: z.boolean().optional().default(false),
  })).min(1),
  isDefault: z.boolean().optional().default(false),
});

export type SaveStatementLayoutInput = z.input<typeof saveStatementLayoutSchema>;

export const generateRetainedEarningsSchema = z.object({
  fiscalYearEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  retainedEarningsAccountId: z.string().min(1),
  memo: z.string().optional(),
});

export type GenerateRetainedEarningsInput = z.input<typeof generateRetainedEarningsSchema>;

// ── Settlement Schemas ───────────────────────────────────────────────

const SETTLEMENT_STATUSES = ['pending', 'matched', 'posted', 'disputed'] as const;
const IMPORT_SOURCES = ['csv', 'webhook', 'manual'] as const;

export const createSettlementSchema = z.object({
  locationId: z.string().optional(),
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  processorName: z.string().min(1).max(200),
  processorBatchId: z.string().max(200).optional(),
  grossAmount: z.string().min(1),
  feeAmount: z.string().optional().default('0'),
  netAmount: z.string().min(1),
  chargebackAmount: z.string().optional().default('0'),
  bankAccountId: z.string().optional(),
  importSource: z.enum(IMPORT_SOURCES).optional().default('manual'),
  rawData: z.record(z.unknown()).optional(),
  businessDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  businessDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    originalAmountCents: z.number().int(),
    settledAmountCents: z.number().int(),
    feeCents: z.number().int().optional().default(0),
    netCents: z.number().int(),
    tenderId: z.string().optional(),
  })).optional().default([]),
});

export type CreateSettlementInput = z.input<typeof createSettlementSchema>;

export const importSettlementCsvSchema = z.object({
  processorName: z.string().min(1).max(200),
  bankAccountId: z.string().optional(),
  csvContent: z.string().min(1),
});

export type ImportSettlementCsvInput = z.input<typeof importSettlementCsvSchema>;

export const matchSettlementTendersSchema = z.object({
  settlementId: z.string().min(1),
  matches: z.array(z.object({
    settlementLineId: z.string().min(1),
    tenderId: z.string().min(1),
  })).min(1),
});

export type MatchSettlementTendersInput = z.input<typeof matchSettlementTendersSchema>;

export const postSettlementSchema = z.object({
  settlementId: z.string().min(1),
  force: z.boolean().optional().default(false),
});

export type PostSettlementInput = z.input<typeof postSettlementSchema>;

export const voidSettlementSchema = z.object({
  settlementId: z.string().min(1),
  reason: z.string().min(1),
});

export type VoidSettlementInput = z.input<typeof voidSettlementSchema>;

// ── Tip Payout Schemas ──────────────────────────────────────────────

const TIP_PAYOUT_TYPES = ['cash', 'payroll', 'check'] as const;

export const createTipPayoutSchema = z.object({
  locationId: z.string().min(1),
  employeeId: z.string().min(1),
  payoutType: z.enum(TIP_PAYOUT_TYPES),
  amountCents: z.number().int().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  drawerSessionId: z.string().optional(),
  payrollPeriod: z.string().optional(),
  approvedBy: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateTipPayoutInput = z.input<typeof createTipPayoutSchema>;

export const voidTipPayoutSchema = z.object({
  payoutId: z.string().min(1),
  reason: z.string().min(1),
});

export type VoidTipPayoutInput = z.input<typeof voidTipPayoutSchema>;

export const listTipPayoutsSchema = z.object({
  locationId: z.string().optional(),
  employeeId: z.string().optional(),
  businessDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  businessDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'completed', 'voided']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

export type ListTipPayoutsInput = z.input<typeof listTipPayoutsSchema>;

// ── Periodic COGS Schemas ─────────────────────────────────────────

export const calculatePeriodicCogsSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locationId: z.string().optional(),
  endingInventoryOverride: z.string().optional(), // manual override of ending inventory (dollars)
});

export type CalculatePeriodicCogsInput = z.input<typeof calculatePeriodicCogsSchema>;

export const postPeriodicCogsSchema = z.object({
  calculationId: z.string().min(1),
});

export type PostPeriodicCogsInput = z.input<typeof postPeriodicCogsSchema>;

export const listPeriodicCogsSchema = z.object({
  locationId: z.string().optional(),
  status: z.enum(['draft', 'posted']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type ListPeriodicCogsInput = z.input<typeof listPeriodicCogsSchema>;

// ── Pending Breakage Review Schemas ─────────────────────────────

export const reviewBreakageSchema = z.object({
  reviewItemId: z.string().min(1),
  action: z.enum(['approve', 'decline']),
  notes: z.string().optional(),
});

export type ReviewBreakageInput = z.input<typeof reviewBreakageSchema>;

export const listPendingBreakageSchema = z.object({
  status: z.enum(['pending', 'approved', 'declined']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

export type ListPendingBreakageInput = z.input<typeof listPendingBreakageSchema>;

// ── Recurring Journal Template Schemas ──────────────────────────

const recurringTemplateLineSchema = z.object({
  accountId: z.string().min(1),
  debitAmount: z.string().default('0'),
  creditAmount: z.string().default('0'),
  memo: z.string().optional(),
});

export const createRecurringTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'annually']),
  dayOfPeriod: z.number().int().min(0).max(28).default(1), // 0 = last day
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  templateLines: z.array(recurringTemplateLineSchema).min(2),
});

export type CreateRecurringTemplateInput = z.input<typeof createRecurringTemplateSchema>;

export const updateRecurringTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'annually']).optional(),
  dayOfPeriod: z.number().int().min(0).max(28).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  templateLines: z.array(recurringTemplateLineSchema).min(2).optional(),
});

export type UpdateRecurringTemplateInput = z.input<typeof updateRecurringTemplateSchema>;

export const executeRecurringTemplateSchema = z.object({
  templateId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // defaults to today
});

export type ExecuteRecurringTemplateInput = z.input<typeof executeRecurringTemplateSchema>;

export const listRecurringTemplatesSchema = z.object({
  isActive: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type ListRecurringTemplatesInput = z.input<typeof listRecurringTemplatesSchema>;

// ── Bank Reconciliation Schemas ─────────────────────────────────

export const startBankReconciliationSchema = z.object({
  bankAccountId: z.string().min(1),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statementEndingBalance: z.string().min(1), // dollars as string, NUMERIC(12,2)
});

export type StartBankReconciliationInput = z.input<typeof startBankReconciliationSchema>;

export const clearReconciliationItemsSchema = z.object({
  reconciliationId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1),
  cleared: z.boolean(),
});

export type ClearReconciliationItemsInput = z.input<typeof clearReconciliationItemsSchema>;

export const addBankAdjustmentSchema = z.object({
  reconciliationId: z.string().min(1),
  itemType: z.enum(['fee', 'interest', 'adjustment']),
  amount: z.string().min(1), // dollars
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
});

export type AddBankAdjustmentInput = z.input<typeof addBankAdjustmentSchema>;

export const completeBankReconciliationSchema = z.object({
  reconciliationId: z.string().min(1),
  notes: z.string().optional(),
});

export type CompleteBankReconciliationInput = z.input<typeof completeBankReconciliationSchema>;

export const listBankReconciliationsSchema = z.object({
  bankAccountId: z.string().optional(),
  status: z.enum(['in_progress', 'completed']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type ListBankReconciliationsInput = z.input<typeof listBankReconciliationsSchema>;
