import { z } from 'zod';

// ── Membership Account ──────────────────────────────────────────

export const createMembershipAccountSchema = z.object({
  accountNumber: z.string().min(1).max(50),
  primaryMemberId: z.string().min(1),
  customerId: z.string().min(1),
  startDate: z.string().min(1), // ISO date
  endDate: z.string().optional(),
  billingEmail: z.string().email().optional(),
  billingAddressJson: z.record(z.unknown()).optional(),
  statementDayOfMonth: z.number().int().min(1).max(28).default(1),
  paymentTermsDays: z.number().int().min(0).default(30),
  autopayEnabled: z.boolean().default(false),
  creditLimitCents: z.number().int().min(0).default(0),
  billingAccountId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateMembershipAccountInput = z.input<typeof createMembershipAccountSchema>;

export const updateMembershipAccountSchema = z.object({
  accountId: z.string().min(1),
  billingEmail: z.string().email().optional().nullable(),
  billingAddressJson: z.record(z.unknown()).optional().nullable(),
  statementDayOfMonth: z.number().int().min(1).max(28).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  autopayEnabled: z.boolean().optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  holdCharging: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'suspended', 'frozen', 'terminated']).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  primaryMemberId: z.string().optional().nullable(),
  billingAccountId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});
export type UpdateMembershipAccountInput = z.infer<typeof updateMembershipAccountSchema>;

// ── Membership Member ───────────────────────────────────────────

export const addMembershipMemberSchema = z.object({
  membershipAccountId: z.string().min(1),
  customerId: z.string().min(1),
  role: z.enum(['primary', 'spouse', 'dependent', 'corporate_designee']).default('dependent'),
  chargePrivileges: z.record(z.unknown()).optional(),
  memberNumber: z.string().max(50).optional(),
  clientRequestId: z.string().optional(),
});
export type AddMembershipMemberInput = z.input<typeof addMembershipMemberSchema>;

export const updateMembershipMemberSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(['primary', 'spouse', 'dependent', 'corporate_designee']).optional(),
  chargePrivileges: z.record(z.unknown()).optional().nullable(),
  memberNumber: z.string().max(50).optional().nullable(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
});
export type UpdateMembershipMemberInput = z.infer<typeof updateMembershipMemberSchema>;

// ── Membership Class ────────────────────────────────────────────

export const addMembershipClassSchema = z.object({
  membershipAccountId: z.string().min(1),
  className: z.string().min(1).max(200),
  effectiveDate: z.string().min(1),
  expirationDate: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type AddMembershipClassInput = z.input<typeof addMembershipClassSchema>;

// ── Billing Item ────────────────────────────────────────────────

export const addBillingItemSchema = z.object({
  membershipAccountId: z.string().min(1),
  classId: z.string().optional(),
  description: z.string().min(1).max(500),
  amountCents: z.number().int(),
  discountCents: z.number().int().default(0),
  frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']).default('monthly'),
  taxRateId: z.string().optional(),
  glRevenueAccountId: z.string().optional(),
  glDeferredRevenueAccountId: z.string().optional(),
  prorationEnabled: z.boolean().default(false),
  seasonalJson: z.record(z.unknown()).optional(),
  isSubMemberItem: z.boolean().default(false),
  clientRequestId: z.string().optional(),
});
export type AddBillingItemInput = z.input<typeof addBillingItemSchema>;

export const updateBillingItemSchema = z.object({
  billingItemId: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  amountCents: z.number().int().optional(),
  discountCents: z.number().int().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']).optional(),
  isActive: z.boolean().optional(),
  taxRateId: z.string().optional().nullable(),
  glRevenueAccountId: z.string().optional().nullable(),
  glDeferredRevenueAccountId: z.string().optional().nullable(),
  prorationEnabled: z.boolean().optional(),
  seasonalJson: z.record(z.unknown()).optional().nullable(),
  isSubMemberItem: z.boolean().optional(),
});
export type UpdateBillingItemInput = z.infer<typeof updateBillingItemSchema>;

// ── Authorized User ─────────────────────────────────────────────

export const addAuthorizedUserSchema = z.object({
  membershipAccountId: z.string().min(1),
  name: z.string().min(1).max(200),
  relationship: z.string().max(100).optional(),
  privilegesJson: z.record(z.unknown()).optional(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type AddAuthorizedUserInput = z.input<typeof addAuthorizedUserSchema>;

export const updateAuthorizedUserSchema = z.object({
  authorizedUserId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  relationship: z.string().max(100).optional().nullable(),
  privilegesJson: z.record(z.unknown()).optional().nullable(),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
});
export type UpdateAuthorizedUserInput = z.infer<typeof updateAuthorizedUserSchema>;

// ── Accounting Settings ─────────────────────────────────────────

export const updateMembershipAccountingSettingsSchema = z.object({
  clubModel: z.enum(['for_profit', 'member_owned']).optional(),
  recognitionPolicy: z.record(z.unknown()).optional(),
  defaultDuesRevenueAccountId: z.string().optional().nullable(),
  defaultDeferredRevenueAccountId: z.string().optional().nullable(),
  defaultInitiationRevenueAccountId: z.string().optional().nullable(),
  defaultNotesReceivableAccountId: z.string().optional().nullable(),
  defaultInterestIncomeAccountId: z.string().optional().nullable(),
  defaultCapitalContributionAccountId: z.string().optional().nullable(),
  defaultBadDebtAccountId: z.string().optional().nullable(),
  defaultLateFeeAccountId: z.string().optional().nullable(),
  defaultMinimumRevenueAccountId: z.string().optional().nullable(),
});
export type UpdateMembershipAccountingSettingsInput = z.infer<typeof updateMembershipAccountingSettingsSchema>;

// ── Assign Plan (Session 6) ───────────────────────────────────

export const assignPlanSchema = z.object({
  membershipAccountId: z.string().min(1),
  planId: z.string().min(1),
  effectiveDate: z.string().optional(), // ISO date — defaults to today
  prorationEnabled: z.boolean().default(false),
  clientRequestId: z.string().optional(),
});
export type AssignPlanInput = z.input<typeof assignPlanSchema>;

// ── Change Plan (Session 6) ───────────────────────────────────

export const changePlanSchema = z.object({
  membershipAccountId: z.string().min(1),
  newPlanId: z.string().min(1),
  effectiveDate: z.string().optional(), // ISO date — defaults to today
  prorationEnabled: z.boolean().default(false),
});
export type ChangePlanInput = z.input<typeof changePlanSchema>;

// ── Close Billing Cycle (Session 6) ───────────────────────────

export const closeBillingCycleSchema = z.object({
  cycleDate: z.string().min(1), // ISO date — process subscriptions with nextBillDate <= this date
});
export type CloseBillingCycleInput = z.infer<typeof closeBillingCycleSchema>;

// ── Generate Statement (Session 6) ────────────────────────────

export const generateStatementSchema = z.object({
  membershipAccountId: z.string().min(1),
  periodStart: z.string().min(1), // ISO date
  periodEnd: z.string().min(1),   // ISO date
  dueDate: z.string().min(1),     // ISO date
});
export type GenerateStatementInput = z.infer<typeof generateStatementSchema>;

// ── Create Membership Plan V2 (Session 6) ─────────────────────

export const createMembershipPlanV2Schema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0),
  duesAmountCents: z.number().int().min(0).optional(),
  billingFrequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).default('monthly'),
  prorationPolicy: z.enum(['daily', 'half_month', 'none']).default('daily'),
  minMonthsCommitment: z.number().int().min(0).optional(),
  glDuesRevenueAccountId: z.string().optional(),
  taxable: z.boolean().default(true),
  privileges: z.array(z.unknown()).optional(),
  rules: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateMembershipPlanV2Input = z.input<typeof createMembershipPlanV2Schema>;

// ── Update Membership Plan V2 (Session 6) ─────────────────────

export const updateMembershipPlanV2Schema = z.object({
  planId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priceCents: z.number().int().min(0).optional(),
  duesAmountCents: z.number().int().min(0).optional().nullable(),
  billingFrequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).optional(),
  prorationPolicy: z.enum(['daily', 'half_month', 'none']).optional(),
  minMonthsCommitment: z.number().int().min(0).optional().nullable(),
  glDuesRevenueAccountId: z.string().optional().nullable(),
  taxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  privileges: z.array(z.unknown()).optional().nullable(),
  rules: z.record(z.unknown()).optional().nullable(),
});
export type UpdateMembershipPlanV2Input = z.infer<typeof updateMembershipPlanV2Schema>;

// ── Configure Minimum Policy (Session 7) ────────────────────────

export const configureMinimumPolicySchema = z.object({
  ruleId: z.string().optional(), // If provided, updates existing rule
  title: z.string().min(1).max(200),
  amountCents: z.number().int().min(0),
  membershipPlanId: z.string().optional(),
  bucketType: z.enum(['food_beverage', 'retail', 'golf', 'service', 'all', 'custom']).default('all'),
  allocationMethod: z.enum(['first_match', 'proportional', 'priority']).default('first_match'),
  rolloverPolicy: z.enum(['none', 'monthly_to_monthly', 'within_quarter']).default('none'),
  excludeTax: z.boolean().default(true),
  excludeTips: z.boolean().default(true),
  excludeServiceCharges: z.boolean().default(true),
  excludeDues: z.boolean().default(true),
  departmentIds: z.array(z.string()).optional(),
});
export type ConfigureMinimumPolicyInput = z.input<typeof configureMinimumPolicySchema>;

// ── Compute Minimums (Session 7) ────────────────────────────────

export const computeMinimumsSchema = z.object({
  customerId: z.string().min(1),
  ruleId: z.string().min(1),
  periodStart: z.string().min(1), // ISO date
  periodEnd: z.string().min(1),   // ISO date
  spentCents: z.number().int().min(0).optional(), // Pre-filtered spend (exclusions applied by caller)
});
export type ComputeMinimumsInput = z.input<typeof computeMinimumsSchema>;

// ── Assign Minimum to Member (Session 7) ────────────────────────

export const assignMinimumToMemberSchema = z.object({
  membershipAccountId: z.string().min(1),
  ruleId: z.string().min(1),
  customerId: z.string().optional(), // Defaults to account's customerId
  startDate: z.string().optional(),  // ISO date — defaults to today
  endDate: z.string().optional(),    // ISO date
  periodEnd: z.string().optional(),  // ISO date — defaults to end of month
});
export type AssignMinimumToMemberInput = z.input<typeof assignMinimumToMemberSchema>;

// ── Rollover Minimum Balance (Session 7) ────────────────────────

export const rolloverMinimumBalanceSchema = z.object({
  rollupId: z.string().min(1),          // Existing period rollup to roll from
  newPeriodStart: z.string().optional(), // ISO date — defaults to prior period end
  newPeriodEnd: z.string().optional(),   // ISO date — defaults to computed next month end
});
export type RolloverMinimumBalanceInput = z.input<typeof rolloverMinimumBalanceSchema>;

// ── Create Initiation Contract (Session 8) ─────────────────────
export const createInitiationContractSchema = z.object({
  membershipAccountId: z.string().min(1),
  contractDate: z.string().min(1), // ISO date
  initiationFeeCents: z.number().int().min(0),
  downPaymentCents: z.number().int().min(0).default(0),
  aprBps: z.number().int().min(0).default(0),
  termMonths: z.number().int().min(1).max(360),
  paymentDayOfMonth: z.number().int().min(1).max(28).default(1),
  glInitiationRevenueAccountId: z.string().optional(),
  glNotesReceivableAccountId: z.string().optional(),
  glInterestIncomeAccountId: z.string().optional(),
  glCapitalContributionAccountId: z.string().optional(),
  glDeferredRevenueAccountId: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type CreateInitiationContractInput = z.input<typeof createInitiationContractSchema>;

// ── Bill Initiation Installment (Session 8) ─────────────────────
export const billInitiationInstallmentSchema = z.object({
  contractId: z.string().min(1),
  periodIndex: z.number().int().min(0),
});
export type BillInitiationInstallmentInput = z.infer<typeof billInitiationInstallmentSchema>;

// ── Record Extra Principal (Session 8) ──────────────────────────
export const recordExtraPrincipalSchema = z.object({
  contractId: z.string().min(1),
  amountCents: z.number().int().min(1),
  effectiveDate: z.string().optional(), // ISO date, defaults to today
});
export type RecordExtraPrincipalInput = z.infer<typeof recordExtraPrincipalSchema>;

// ── Cancel Initiation Contract (Session 8) ──────────────────────
export const cancelInitiationContractSchema = z.object({
  contractId: z.string().min(1),
  reason: z.string().min(1).max(500),
});
export type CancelInitiationContractInput = z.infer<typeof cancelInitiationContractSchema>;

// ── Compute Payoff Quote (Session 8) ────────────────────────────
export const computePayoffQuoteSchema = z.object({
  contractId: z.string().min(1),
  payoffDate: z.string().optional(), // ISO date, defaults to today
});
export type ComputePayoffQuoteInput = z.infer<typeof computePayoffQuoteSchema>;

// ── Configure Autopay Profile (Session 9) ────────────────────────
export const configureAutopayProfileSchema = z.object({
  membershipAccountId: z.string().min(1),
  paymentMethodId: z.string().optional().nullable(),
  strategy: z.enum(['full_balance', 'minimum_due', 'fixed_amount', 'selected_accounts']).default('full_balance'),
  fixedAmountCents: z.number().int().min(0).default(0),
  selectedAccountTypes: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
});
export type ConfigureAutopayProfileInput = z.input<typeof configureAutopayProfileSchema>;

// ── Run Autopay Batch (Session 9) ────────────────────────────────
export const runAutopayBatchSchema = z.object({
  runDate: z.string().min(1), // ISO date
});
export type RunAutopayBatchInput = z.infer<typeof runAutopayBatchSchema>;

// ── Retry Failed Autopay (Session 9) ─────────────────────────────
export const retryFailedAutopaySchema = z.object({
  attemptId: z.string().min(1),
});
export type RetryFailedAutopayInput = z.infer<typeof retryFailedAutopaySchema>;

// ── Apply Late Fee (Session 9) ───────────────────────────────────
export const applyLateFeeSchema = z.object({
  membershipAccountId: z.string().min(1),
  overdueAmountCents: z.number().int().min(0),
  feeAmountCents: z.number().int().min(1),
  assessmentDate: z.string().optional(), // ISO date, defaults to today
});
export type ApplyLateFeeInput = z.input<typeof applyLateFeeSchema>;

// ── Set Charging Hold (Session 9) ────────────────────────────────
export const setChargingHoldSchema = z.object({
  membershipAccountId: z.string().min(1),
  holdType: z.enum(['charging', 'full', 'billing']).default('charging'),
  reason: z.string().min(1).max(500),
});
export type SetChargingHoldInput = z.input<typeof setChargingHoldSchema>;

// ── Lift Hold (Session 9) ────────────────────────────────────────
export const liftHoldSchema = z.object({
  holdId: z.string().min(1),
  reason: z.string().min(1).max(500),
});
export type LiftHoldInput = z.infer<typeof liftHoldSchema>;

// ── Freeze Membership (Session 9) ────────────────────────────────
export const freezeMembershipSchema = z.object({
  membershipAccountId: z.string().min(1),
  reason: z.string().min(1).max(500),
});
export type FreezeMembershipInput = z.infer<typeof freezeMembershipSchema>;

// ── Preview Billing Cycle (Session 10) ───────────────────────────
export const previewBillingCycleSchema = z.object({
  cycleDate: z.string().min(1), // ISO date
});
export type PreviewBillingCycleInput = z.infer<typeof previewBillingCycleSchema>;

// ── Execute Billing Step (Session 10) ────────────────────────────
export const executeBillingStepSchema = z.object({
  runId: z.string().min(1),
  stepName: z.enum([
    'preview_dues',
    'preview_initiation',
    'compute_minimums',
    'exception_review',
    'generate_statements',
    'run_autopay',
    'review_close',
  ]),
  exceptions: z.array(z.object({
    membershipAccountId: z.string().min(1),
    reason: z.string().min(1),
  })).optional(),
});
export type ExecuteBillingStepInput = z.infer<typeof executeBillingStepSchema>;

// ── Review and Close Cycle (Session 10) ──────────────────────────
export const reviewAndCloseCycleSchema = z.object({
  runId: z.string().min(1),
});
export type ReviewAndCloseCycleInput = z.infer<typeof reviewAndCloseCycleSchema>;
