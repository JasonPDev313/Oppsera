// Module metadata
export const MODULE_KEY = 'membership' as const;
export const MODULE_NAME = 'Membership Management';
export const MODULE_VERSION = '0.0.0';

// Validation schemas
export {
  createMembershipAccountSchema,
  updateMembershipAccountSchema,
  addMembershipMemberSchema,
  updateMembershipMemberSchema,
  addMembershipClassSchema,
  addBillingItemSchema,
  updateBillingItemSchema,
  addAuthorizedUserSchema,
  updateAuthorizedUserSchema,
  updateMembershipAccountingSettingsSchema,
  assignPlanSchema,
  changePlanSchema,
  closeBillingCycleSchema,
  generateStatementSchema,
  createMembershipPlanV2Schema,
  updateMembershipPlanV2Schema,
  configureMinimumPolicySchema,
  assignMinimumToMemberSchema,
  computeMinimumsSchema,
  rolloverMinimumBalanceSchema,
  createInitiationContractSchema,
  billInitiationInstallmentSchema,
  recordExtraPrincipalSchema,
  cancelInitiationContractSchema,
  computePayoffQuoteSchema,
  configureAutopayProfileSchema,
  runAutopayBatchSchema,
  retryFailedAutopaySchema,
  applyLateFeeSchema,
  setChargingHoldSchema,
  liftHoldSchema,
  freezeMembershipSchema,
  previewBillingCycleSchema,
  executeBillingStepSchema,
  reviewAndCloseCycleSchema,
} from './validation';
export type {
  CreateMembershipAccountInput,
  UpdateMembershipAccountInput,
  AddMembershipMemberInput,
  UpdateMembershipMemberInput,
  AddMembershipClassInput,
  AddBillingItemInput,
  UpdateBillingItemInput,
  AddAuthorizedUserInput,
  UpdateAuthorizedUserInput,
  UpdateMembershipAccountingSettingsInput,
  AssignPlanInput,
  ChangePlanInput,
  CloseBillingCycleInput,
  GenerateStatementInput,
  CreateMembershipPlanV2Input,
  UpdateMembershipPlanV2Input,
  ConfigureMinimumPolicyInput,
  AssignMinimumToMemberInput,
  ComputeMinimumsInput,
  RolloverMinimumBalanceInput,
  CreateInitiationContractInput,
  BillInitiationInstallmentInput,
  RecordExtraPrincipalInput,
  CancelInitiationContractInput,
  ComputePayoffQuoteInput,
  ConfigureAutopayProfileInput,
  RunAutopayBatchInput,
  RetryFailedAutopayInput,
  ApplyLateFeeInput,
  SetChargingHoldInput,
  LiftHoldInput,
  FreezeMembershipInput,
  PreviewBillingCycleInput,
  ExecuteBillingStepInput,
  ReviewAndCloseCycleInput,
} from './validation';

// Commands
export { createMembershipAccount } from './commands/create-membership-account';
export { updateMembershipAccount } from './commands/update-membership-account';
export { addMembershipMember } from './commands/add-membership-member';
export { updateMembershipMember } from './commands/update-membership-member';
export { removeMembershipMember } from './commands/remove-membership-member';
export { addMembershipClass } from './commands/add-membership-class';
export { addBillingItem } from './commands/add-billing-item';
export { updateBillingItem } from './commands/update-billing-item';
export { addAuthorizedUser } from './commands/add-authorized-user';
export { updateAuthorizedUser } from './commands/update-authorized-user';
export { updateMembershipAccountingSettings } from './commands/update-membership-accounting-settings';
export { createMembershipPlanV2 } from './commands/create-membership-plan-v2';
export { updateMembershipPlanV2 } from './commands/update-membership-plan-v2';
export { assignPlan } from './commands/assign-plan';
export { changePlan } from './commands/change-plan';
export { closeBillingCycle } from './commands/close-billing-cycle';
export { generateStatement } from './commands/generate-statement';
export { configureMinimumPolicy } from './commands/configure-minimum-policy';
export { assignMinimumToMember } from './commands/assign-minimum-to-member';
export { computeMinimums } from './commands/compute-minimums';
export { rolloverMinimumBalance } from './commands/rollover-minimum-balance';
export { createInitiationContract } from './commands/create-initiation-contract';
export { billInitiationInstallment } from './commands/bill-initiation-installment';
export { recordExtraPrincipal } from './commands/record-extra-principal';
export { cancelInitiationContract } from './commands/cancel-initiation-contract';
export { computePayoffQuoteCommand } from './commands/compute-payoff-quote';
export type { PayoffQuoteResult } from './commands/compute-payoff-quote';
export { configureAutopayProfile } from './commands/configure-autopay-profile';
export { runAutopayBatch } from './commands/run-autopay-batch';
export { retryFailedAutopay } from './commands/retry-failed-autopay';
export { applyLateFee } from './commands/apply-late-fee';
export { setChargingHold } from './commands/set-charging-hold';
export { liftHold } from './commands/lift-hold';
export { freezeMembership } from './commands/freeze-membership';
export { previewBillingCycle } from './commands/preview-billing-cycle';
export { executeBillingStep } from './commands/execute-billing-step';
export { reviewAndCloseCycle } from './commands/review-and-close-cycle';

// Helpers
export { computeProration, advanceByFrequency, computePeriodEnd } from './helpers/proration';
export type { ProrationPolicy } from './helpers/proration';
export { computeMinimumProgress, allocateSpend } from './helpers/minimum-engine';
export type { MinimumComputeInput, MinimumComputeResult, AllocationBucket, AllocationResult } from './helpers/minimum-engine';
export { generateAmortSchedule, computePayoffQuote, recalculateAfterExtraPrincipal } from './helpers/amortization';
export type { AmortScheduleEntry } from './helpers/amortization';
export { computeRetrySchedule, computeLateFee } from './helpers/autopay-retry';
export type { RetrySchedule } from './helpers/autopay-retry';
export { predictChurnRisk, projectShortfall, assessDelinquencyRisk } from './helpers/predictive-insights';
export type { ChurnRiskInput, ChurnRiskResult, ChurnRiskFactor, ShortfallProjectionInput, ShortfallProjectionResult, DelinquencyRiskInput, DelinquencyRiskResult } from './helpers/predictive-insights';

// Queries
export {
  listMembershipAccounts,
  getMembershipAccount,
  getMembershipAccountingSettings,
  listSubscriptions,
  listStatements,
  getStatementDetail,
  getMinimumProgress,
  getMinimumComplianceDashboard,
  getMinimumHistory,
  listMinimumPolicies,
  getInitiationSummary,
  getInitiationSchedule,
  getDeferredRevenueSchedule,
  getAutopayProfile,
  getAutopayDashboard,
  getRiskDashboard,
  getCollectionsTimeline,
  getBillingCyclePreview,
  getBillingCycleRun,
  getMembershipAging,
  getMembershipComplianceReport,
  getMembershipSpendReport,
  getMembershipChurnReport,
  getMembershipPortfolioReport,
  getMembershipPredictiveInsights,
  getMemberPortalAccount,
  getMemberPortalSummary,
} from './queries';
export type {
  ListMembershipAccountsInput,
  MembershipAccountListEntry,
  ListMembershipAccountsResult,
  GetMembershipAccountInput,
  MembershipAccountDetail,
  MembershipMemberEntry,
  MembershipClassEntry,
  MembershipBillingItemEntry,
  MembershipAuthorizedUserEntry,
  GetMembershipAccountingSettingsInput,
  MembershipAccountingSettingsData,
  ListSubscriptionsInput,
  SubscriptionEntry,
  ListSubscriptionsResult,
  ListStatementsInput,
  StatementEntry,
  ListStatementsResult,
  GetStatementDetailInput,
  StatementLineEntry,
  StatementDetail,
  GetMinimumProgressInput,
  MinimumProgressEntry,
  GetMinimumComplianceDashboardInput,
  MinimumComplianceEntry,
  MinimumComplianceDashboard,
  GetMinimumHistoryInput,
  MinimumHistoryEntry,
  GetMinimumHistoryResult,
  ListMinimumPoliciesInput,
  MinimumPolicyEntry,
  GetInitiationSummaryInput,
  InitiationContractSummary,
  GetInitiationScheduleInput,
  InitiationScheduleEntry,
  InitiationScheduleResult,
  GetDeferredRevenueScheduleInput,
  DeferredRevenueEntry,
  DeferredRevenueScheduleResult,
  GetAutopayProfileInput,
  AutopayProfileData,
  GetAutopayDashboardInput,
  AutopayRunEntry,
  AutopayDashboard,
  GetRiskDashboardInput,
  RiskHoldEntry,
  RiskLateFeeEntry,
  RiskDashboard,
  GetCollectionsTimelineInput,
  CollectionsTimelineEntry,
  GetCollectionsTimelineResult,
  GetBillingCyclePreviewInput,
  BillingCyclePreview,
  GetBillingCycleRunInput,
  BillingCycleRunData,
  GetMembershipAgingInput,
  MembershipAgingEntry,
  MembershipAgingResult,
  GetMembershipComplianceReportInput,
  MembershipComplianceEntry,
  GetMembershipSpendReportInput,
  MembershipSpendEntry,
  MembershipSpendReport,
  GetMembershipChurnReportInput,
  MembershipChurnEntry,
  MembershipChurnReport,
  GetMembershipPortfolioReportInput,
  MembershipPortfolioData,
  GetMembershipPredictiveInsightsInput,
  PredictiveInsight,
  MembershipPredictiveInsightsResult,
  GetMemberPortalAccountInput,
  MemberPortalAccount,
  GetMemberPortalSummaryInput,
  MemberPortalStatementSummary,
  MemberPortalSummary,
} from './queries';
