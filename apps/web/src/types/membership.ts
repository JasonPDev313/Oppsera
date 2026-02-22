// Session 6: Dues Engine + Statements types

export interface MembershipSubscription {
  id: string;
  membershipAccountId: string;
  planId: string;
  planName: string;
  status: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  nextBillDate: string | null;
  lastBilledDate: string | null;
  billedThroughDate: string | null;
  createdAt: string;
}

export interface MembershipPlanV2 {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  duesAmountCents: number | null;
  billingFrequency: string;
  prorationPolicy: string;
  minMonthsCommitment: number | null;
  taxable: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface StatementEntry {
  id: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: number;
  chargesCents: number;
  paymentsCents: number;
  lateFeesCents: number;
  closingBalanceCents: number;
  dueDate: string;
  status: string;
  statementNumber: string | null;
  deliveryStatus: string;
  createdAt: string;
}

export interface StatementLineEntry {
  id: string;
  lineType: string;
  description: string;
  amountCents: number;
  sourceTransactionId: string | null;
  departmentId: string | null;
  metaJson: Record<string, unknown> | null;
  sortOrder: number;
}

export interface StatementDetail extends StatementEntry {
  membershipAccountId: string | null;
  pdfStorageKey: string | null;
  metaJson: Record<string, unknown> | null;
  lines: StatementLineEntry[];
}

// Session 7: Minimums Engine + Progress UX types

export interface MinimumProgressEntry {
  id: string;
  customerId: string;
  ruleId: string;
  periodStart: string;
  periodEnd: string;
  requiredCents: number;
  satisfiedCents: number;
  shortfallCents: number;
  rolloverInCents: number;
  rolloverOutCents: number;
  progressPercent: number;
  isMetMinimum: boolean;
  status: string;
}

export interface MinimumHistoryEntry extends MinimumProgressEntry {
  createdAt: string;
}

export interface MinimumComplianceEntry {
  customerId: string;
  ruleId: string;
  periodStart: string;
  periodEnd: string;
  requiredCents: number;
  satisfiedCents: number;
  shortfallCents: number;
  progressPercent: number;
  status: string;
  trafficLight: 'green' | 'amber' | 'red';
}

export interface MinimumComplianceDashboard {
  totalMembers: number;
  metMinimum: number;
  atRisk: number;
  belowMinimum: number;
  totalRequiredCents: number;
  totalSatisfiedCents: number;
  totalShortfallCents: number;
  entries: MinimumComplianceEntry[];
}

export interface MinimumPolicyEntry {
  id: string;
  title: string;
  amountCents: number;
  membershipPlanId: string | null;
  bucketType: string | null;
  allocationMethod: string | null;
  rolloverPolicy: string | null;
  excludeTax: boolean;
  excludeTips: boolean;
  excludeServiceCharges: boolean;
  excludeDues: boolean;
  createdAt: string;
}

// -- Session 8: Initiation Financing --

export interface InitiationContractSummary {
  id: string;
  contractDate: string;
  initiationFeeCents: number;
  downPaymentCents: number;
  financedPrincipalCents: number;
  aprBps: number;
  termMonths: number;
  status: string;
  paidPrincipalCents: number;
  paidInterestCents: number;
  remainingPrincipalCents: number;
  nextPaymentDate: string | null;
  nextPaymentCents: number | null;
  progressPercent: number;
}

export interface InitiationScheduleEntry {
  id: string;
  periodIndex: number;
  dueDate: string;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  status: string;
  billedAt: string | null;
  paidAt: string | null;
}

export interface InitiationScheduleResult {
  contract: {
    id: string;
    membershipAccountId: string;
    contractDate: string;
    initiationFeeCents: number;
    downPaymentCents: number;
    financedPrincipalCents: number;
    aprBps: number;
    termMonths: number;
    status: string;
    paidPrincipalCents: number;
    paidInterestCents: number;
    recognitionPolicySnapshot: Record<string, unknown>;
  };
  schedule: InitiationScheduleEntry[];
}

export interface PayoffQuote {
  contractId: string;
  payoffDate: string;
  payoffAmountCents: number;
  accruedInterestCents: number;
  principalCents: number;
}

export interface DeferredRevenueEntry {
  contractId: string;
  membershipAccountId: string;
  contractDate: string;
  totalFeeCents: number;
  recognizedCents: number;
  deferredCents: number;
  clubModel: string;
  nextRecognitionDate: string | null;
}

export interface DeferredRevenueScheduleResult {
  entries: DeferredRevenueEntry[];
  totalDeferredCents: number;
  totalRecognizedCents: number;
}

// ── Autopay (Session 9) ──────────────────────────────────────────

export interface AutopayProfile {
  id: string;
  membershipAccountId: string;
  paymentMethodId: string | null;
  strategy: string;
  fixedAmountCents: number;
  selectedAccountTypes: string[] | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface AutopayRunEntry {
  id: string;
  runDate: string;
  status: string;
  totalProfilesCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalCollectedCents: number;
}

export interface AutopayDashboard {
  recentRuns: AutopayRunEntry[];
  activeProfilesCount: number;
  pendingRetriesCount: number;
}

export interface RiskDashboard {
  totalActiveAccounts: number;
  accountsWithHolds: number;
  frozenAccounts: number;
  suspendedAccounts: number;
  activeHolds: RiskHoldEntry[];
  recentLateFees: RiskLateFeeEntry[];
}

export interface RiskHoldEntry {
  id: string;
  membershipAccountId: string;
  holdType: string;
  reason: string;
  placedBy: string;
  placedAt: string;
}

export interface RiskLateFeeEntry {
  id: string;
  membershipAccountId: string;
  assessmentDate: string;
  overdueAmountCents: number;
  feeAmountCents: number;
  waived: boolean;
}

export interface CollectionsTimelineEntry {
  id: string;
  type: 'autopay_attempt' | 'late_fee' | 'hold_placed' | 'hold_lifted';
  occurredAt: string;
  description: string;
  amountCents: number | null;
  status: string | null;
}

// ── Billing Command Center (Session 10) ──────────────────────────
export interface BillingCycleRun {
  id: string;
  cycleDate: string;
  status: string;
  previewSummary: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  totalDuesBilledCents: number;
  totalInitiationBilledCents: number;
  totalMinimumsChargedCents: number;
  totalLateFeesCents: number;
  totalStatementsGenerated: number;
  totalAutopayCollectedCents: number;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type BillingStepName =
  | 'preview_dues'
  | 'preview_initiation'
  | 'compute_minimums'
  | 'exception_review'
  | 'generate_statements'
  | 'run_autopay'
  | 'review_close';

// ── Session 11: Reporting Types ──────────────────────────────────

export interface MembershipAgingEntry {
  membershipAccountId: string;
  currentCents: number;
  days1To30Cents: number;
  days31To60Cents: number;
  days61To90Cents: number;
  daysOver90Cents: number;
  totalOutstandingCents: number;
  lastPaymentDate: string | null;
}

export interface MembershipAgingReport {
  asOfDate: string;
  entries: MembershipAgingEntry[];
  totals: {
    currentCents: number;
    days1To30Cents: number;
    days31To60Cents: number;
    days61To90Cents: number;
    daysOver90Cents: number;
    totalOutstandingCents: number;
  };
}

export interface MembershipComplianceReportEntry {
  membershipAccountId: string;
  requiredCents: number;
  satisfiedCents: number;
  shortfallCents: number;
  compliancePct: number;
  status: string;
}

export interface MembershipComplianceReportData {
  periodKey: string;
  entries: MembershipComplianceReportEntry[];
  summary: {
    totalAccounts: number;
    onTrackCount: number;
    atRiskCount: number;
    nonCompliantCount: number;
    avgCompliancePct: number;
  };
}

export interface MembershipSpendEntry {
  membershipAccountId: string;
  category: string;
  spendCents: number;
  transactionCount: number;
}

export interface MembershipSpendReportData {
  periodKey: string;
  entries: MembershipSpendEntry[];
  categoryTotals: Array<{ category: string; totalSpendCents: number; totalTransactions: number }>;
  grandTotalCents: number;
}

export interface MembershipChurnEntry {
  membershipAccountId: string;
  riskScore: number;
  riskLevel: string;
  daysSinceLastVisit: number | null;
  visitTrend: string | null;
  spendTrend: string | null;
  autopayFailures: number;
  hasHold: boolean;
  hasLateFees: boolean;
  predictedChurnMonth: string | null;
  factors: string[];
}

export interface MembershipChurnReportData {
  entries: MembershipChurnEntry[];
  summary: {
    totalAccounts: number;
    lowCount: number;
    mediumCount: number;
    highCount: number;
    criticalCount: number;
    avgRiskScore: number;
  };
}

export interface MembershipPortfolioData {
  asOfDate: string;
  totalAccounts: number;
  activeAccounts: number;
  suspendedAccounts: number;
  frozenAccounts: number;
  terminatedAccounts: number;
  totalArCents: number;
  totalDeferredRevenueCents: number;
  avgAccountAgeDays: number | null;
  newAccountsThisMonth: number;
  terminatedThisMonth: number;
  netMemberGrowth: number;
  totalDuesRevenueCents: number;
  totalInitiationRevenueCents: number;
  totalMinimumRevenueCents: number;
  totalLateFeeRevenueCents: number;
  autopayAdoptionPct: number;
  avgCollectionDays: number | null;
}

export interface PredictiveInsight {
  type: 'churn_risk' | 'shortfall_projection' | 'delinquency_risk' | 'growth_trend';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affectedCount: number;
  metricValue: number | null;
}

export interface MembershipPredictiveInsights {
  insights: PredictiveInsight[];
  generatedAt: string;
}

// ── Session 12: Member Portal Types ──────────────────────────────

export interface MemberPortalAccount {
  accountId: string;
  accountNumber: string;
  status: string;
  memberRole: string;
  planName: string | null;
  currentBalanceCents: number;
  creditLimitCents: number;
  autopayEnabled: boolean;
  statementDayOfMonth: number;
  startDate: string | null;
}

export interface MemberPortalStatementSummary {
  id: string;
  statementNumber: string | null;
  periodStart: string;
  periodEnd: string;
  totalDueCents: number;
  status: string;
  createdAt: string;
}

export interface MemberPortalSummary {
  accountId: string | null;
  accountNumber: string | null;
  accountStatus: string | null;
  memberRole: string | null;
  creditLimitCents: number;
  autopayEnabled: boolean;
  statementDayOfMonth: number;
  startDate: string | null;
  recentStatements: MemberPortalStatementSummary[];
  activeSubscriptionCount: number;
}

export interface MemberPortalAutopayProfile {
  membershipAccountId: string;
  paymentMethodId: string | null;
  strategy: string;
  fixedAmountCents: number | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}
