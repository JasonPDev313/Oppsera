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
