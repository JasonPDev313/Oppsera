import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  predictChurnRisk,
  projectShortfall,
  assessDelinquencyRisk,
} from '../helpers/predictive-insights';

const TENANT_A = 'tenant_001';

// ── Mock Drizzle chain ──────────────────────────────────────────────

const mockSelectReturns = vi.fn();

const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

function makeWhereResult() {
  let resolved: any[] | null = null;
  const resolve = () => {
    if (resolved === null) {
      const data = mockSelectReturns();
      resolved = Array.isArray(data) ? data : [];
    }
    return resolved;
  };
  return {
    orderBy: mockOrderBy,
    limit: mockLimit,
    [Symbol.iterator]: () => resolve()[Symbol.iterator](),
    then: (onFulfilled: any) => onFulfilled(resolve()),
  };
}

function wireChain() {
  mockOrderBy.mockImplementation(() => {
    const result = mockSelectReturns();
    const arr = Array.isArray(result) ? result : [];
    (arr as any).limit = () => arr;
    return arr;
  });
  mockLimit.mockImplementation(() => mockSelectReturns());
  mockWhere.mockImplementation(() => makeWhereResult());
  mockFrom.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  }));
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
}

wireChain();

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) =>
    fn({ select: mockSelect }),
  ),
  rmMembershipAging: {
    tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    asOfDate: 'as_of_date', currentCents: 'current_cents',
    days1To30Cents: 'days_1_30_cents', days31To60Cents: 'days_31_60_cents',
    days61To90Cents: 'days_61_90_cents', daysOver90Cents: 'days_over_90_cents',
    totalOutstandingCents: 'total_outstanding_cents', lastPaymentDate: 'last_payment_date',
  },
  rmMembershipCompliance: {
    tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    periodKey: 'period_key', requiredCents: 'required_cents',
    satisfiedCents: 'satisfied_cents', shortfallCents: 'shortfall_cents',
    compliancePct: 'compliance_pct', status: 'status',
  },
  rmMembershipSpend: {
    tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    periodKey: 'period_key', category: 'category',
    spendCents: 'spend_cents', transactionCount: 'transaction_count',
  },
  rmMembershipChurn: {
    tenantId: 'tenant_id', membershipAccountId: 'membership_account_id',
    riskScore: 'risk_score', riskLevel: 'risk_level',
    daysSinceLastVisit: 'days_since_last_visit', visitTrend: 'visit_trend',
    spendTrend: 'spend_trend', autopayFailures: 'autopay_failures',
    hasHold: 'has_hold', hasLateFees: 'has_late_fees',
    predictedChurnMonth: 'predicted_churn_month', factorsJson: 'factors_json',
  },
  rmMembershipPortfolio: {
    tenantId: 'tenant_id', asOfDate: 'as_of_date',
    totalAccounts: 'total_accounts', activeAccounts: 'active_accounts',
    suspendedAccounts: 'suspended_accounts', frozenAccounts: 'frozen_accounts',
    terminatedAccounts: 'terminated_accounts', totalArCents: 'total_ar_cents',
    totalDeferredRevenueCents: 'total_deferred_revenue_cents',
    avgAccountAgeDays: 'avg_account_age_days',
    newAccountsThisMonth: 'new_accounts_this_month',
    terminatedThisMonth: 'terminated_this_month',
    netMemberGrowth: 'net_member_growth',
    totalDuesRevenueCents: 'total_dues_revenue_cents',
    totalInitiationRevenueCents: 'total_initiation_revenue_cents',
    totalMinimumRevenueCents: 'total_minimum_revenue_cents',
    totalLateFeeRevenueCents: 'total_late_fee_revenue_cents',
    autopayAdoptionPct: 'autopay_adoption_pct',
    avgCollectionDays: 'avg_collection_days',
  },
}));

beforeEach(() => {
  mockSelectReturns.mockReset();
  wireChain();
});

// ── Predictive Insights Helper Tests ────────────────────────────────

describe('Session 11 — Predictive Insights Helpers', () => {
  describe('predictChurnRisk', () => {
    it('returns low risk for healthy member', () => {
      const result = predictChurnRisk({
        daysSinceLastVisit: 5,
        visitTrend: 'increasing',
        spendTrend: 'increasing',
        autopayFailures: 0,
        hasHold: false,
        hasLateFees: false,
        accountAgeDays: 365,
      });
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBeLessThan(26);
      expect(result.predictedChurnMonth).toBeNull();
    });

    it('returns critical risk for high-risk member', () => {
      const result = predictChurnRisk({
        daysSinceLastVisit: 120,
        visitTrend: 'declining',
        spendTrend: 'declining',
        autopayFailures: 3,
        hasHold: true,
        hasLateFees: true,
        accountAgeDays: 365,
      });
      expect(result.riskLevel).toBe('critical');
      expect(result.riskScore).toBeGreaterThanOrEqual(76);
      expect(result.predictedChurnMonth).not.toBeNull();
      expect(result.factors.length).toBeGreaterThan(3);
    });

    it('returns medium risk for moderate factors', () => {
      // 35 days = 10pts (30-60 range) + declining visits = 15pts + declining spend = 10pts = 35 → medium
      const result = predictChurnRisk({
        daysSinceLastVisit: 35,
        visitTrend: 'declining',
        spendTrend: 'declining',
        autopayFailures: 0,
        hasHold: false,
        hasLateFees: false,
        accountAgeDays: 200,
      });
      expect(result.riskLevel).toBe('medium');
      expect(result.riskScore).toBeGreaterThanOrEqual(26);
      expect(result.riskScore).toBeLessThan(51);
    });

    it('new account bonus reduces score', () => {
      const oldResult = predictChurnRisk({
        daysSinceLastVisit: 35,
        visitTrend: 'declining',
        spendTrend: 'stable',
        autopayFailures: 0,
        hasHold: false,
        hasLateFees: false,
        accountAgeDays: 365,
      });
      const newResult = predictChurnRisk({
        daysSinceLastVisit: 35,
        visitTrend: 'declining',
        spendTrend: 'stable',
        autopayFailures: 0,
        hasHold: false,
        hasLateFees: false,
        accountAgeDays: 30,
      });
      expect(newResult.riskScore).toBeLessThan(oldResult.riskScore);
    });

    it('includes all applicable risk factors', () => {
      const result = predictChurnRisk({
        daysSinceLastVisit: 100,
        visitTrend: 'declining',
        spendTrend: 'declining',
        autopayFailures: 3,
        hasHold: true,
        hasLateFees: true,
        accountAgeDays: 365,
      });
      const factorNames = result.factors.map(f => f.factor);
      expect(factorNames).toContain('absence_90_plus');
      expect(factorNames).toContain('visit_trend_declining');
      expect(factorNames).toContain('spend_trend_declining');
      expect(factorNames).toContain('autopay_failures');
      expect(factorNames).toContain('has_hold');
      expect(factorNames).toContain('has_late_fees');
    });

    it('caps risk score at 100', () => {
      const result = predictChurnRisk({
        daysSinceLastVisit: 200,
        visitTrend: 'declining',
        spendTrend: 'declining',
        autopayFailures: 10,
        hasHold: true,
        hasLateFees: true,
        accountAgeDays: 500,
      });
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('projectShortfall', () => {
    it('returns on_track when projected spend exceeds required', () => {
      const result = projectShortfall({
        spentCents: 60000,
        requiredCents: 100000,
        daysElapsed: 15,
        totalDaysInPeriod: 30,
      });
      expect(result.status).toBe('on_track');
      expect(result.shortfallCents).toBe(0);
    });

    it('returns shortfall when projected spend is below required', () => {
      const result = projectShortfall({
        spentCents: 20000,
        requiredCents: 100000,
        daysElapsed: 20,
        totalDaysInPeriod: 30,
      });
      expect(result.status).toBe('shortfall');
      expect(result.shortfallCents).toBeGreaterThan(0);
    });

    it('computes daily spend needed', () => {
      const result = projectShortfall({
        spentCents: 50000,
        requiredCents: 100000,
        daysElapsed: 15,
        totalDaysInPeriod: 30,
      });
      expect(result.dailySpendNeededCents).toBeGreaterThan(0);
      // 50000 remaining / 15 days = ~3334 per day
      expect(result.dailySpendNeededCents).toBe(Math.ceil(50000 / 15));
    });

    it('handles zero days elapsed', () => {
      const result = projectShortfall({
        spentCents: 0,
        requiredCents: 100000,
        daysElapsed: 0,
        totalDaysInPeriod: 30,
      });
      expect(result.projectedSpendCents).toBe(0);
      expect(result.status).toBe('shortfall');
    });
  });

  describe('assessDelinquencyRisk', () => {
    it('returns low for current member with good history', () => {
      const result = assessDelinquencyRisk({
        daysPastDue: 0,
        outstandingCents: 5000,
        autopayEnabled: true,
        autopayFailures: 0,
        paymentHistoryOnTime: 19,
        paymentHistoryLate: 1,
      });
      expect(result.riskLevel).toBe('low');
      expect(result.suggestedActions).toContain('No action needed');
    });

    it('returns critical for 90+ days past due with failed autopay', () => {
      const result = assessDelinquencyRisk({
        daysPastDue: 100,
        outstandingCents: 600000,
        autopayEnabled: false,
        autopayFailures: 3,
        paymentHistoryOnTime: 3,
        paymentHistoryLate: 7,
      });
      expect(result.riskLevel).toBe('critical');
      expect(result.suggestedActions).toContain('Escalate to collections');
    });

    it('returns correct actions for each risk level', () => {
      // Low
      const low = assessDelinquencyRisk({
        daysPastDue: 0, outstandingCents: 1000, autopayEnabled: true,
        autopayFailures: 0, paymentHistoryOnTime: 20, paymentHistoryLate: 0,
      });
      expect(low.suggestedActions).toContain('No action needed');

      // High: 65 days = 50pts + no autopay = 10pts = 60 → high (51-75)
      const high = assessDelinquencyRisk({
        daysPastDue: 65, outstandingCents: 200000, autopayEnabled: false,
        autopayFailures: 0, paymentHistoryOnTime: 18, paymentHistoryLate: 2,
      });
      expect(high.suggestedActions).toContain('Send final notice');
    });

    it('caps risk score at 100', () => {
      const result = assessDelinquencyRisk({
        daysPastDue: 200,
        outstandingCents: 1000000,
        autopayEnabled: false,
        autopayFailures: 10,
        paymentHistoryOnTime: 0,
        paymentHistoryLate: 20,
      });
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });
  });
});

// ── Query Tests ────────────────────────────────────────────────────

describe('Session 11 — Reporting Queries', () => {
  describe('getMembershipAging', () => {
    it('returns entries with computed totals', async () => {
      const { getMembershipAging } = await import('../queries/get-membership-aging');

      mockSelectReturns.mockReturnValueOnce([
        {
          id: 'ag1', membershipAccountId: 'acct_1', asOfDate: '2025-07-01',
          currentCents: 5000, days1To30Cents: 2000,
          days31To60Cents: 1000, days61To90Cents: 500, daysOver90Cents: 0,
          totalOutstandingCents: 8500, lastPaymentDate: '2025-06-15',
        },
        {
          id: 'ag2', membershipAccountId: 'acct_2', asOfDate: '2025-07-01',
          currentCents: 3000, days1To30Cents: 0,
          days31To60Cents: 0, days61To90Cents: 0, daysOver90Cents: 1000,
          totalOutstandingCents: 4000, lastPaymentDate: null,
        },
      ]);

      const result = await getMembershipAging({ tenantId: TENANT_A });
      expect(result.entries).toHaveLength(2);
      expect(result.totalCurrentCents).toBe(8000);
      expect(result.grandTotalCents).toBe(8000 + 2000 + 1000 + 500 + 1000);
    });

    it('returns empty entries when no data', async () => {
      const { getMembershipAging } = await import('../queries/get-membership-aging');
      mockSelectReturns.mockReturnValueOnce([]);
      const result = await getMembershipAging({ tenantId: TENANT_A });
      expect(result.entries).toHaveLength(0);
      expect(result.grandTotalCents).toBe(0);
    });
  });

  describe('getMembershipComplianceReport', () => {
    it('returns entries with summary counts', async () => {
      const { getMembershipComplianceReport } = await import('../queries/get-membership-compliance-report');

      mockSelectReturns.mockReturnValueOnce([
        { id: 'c1', membershipAccountId: 'acct_1', periodKey: '2025-Q1', requiredCents: 50000, satisfiedCents: 60000, shortfallCents: 0, compliancePct: '120.00', status: 'compliant' },
        { id: 'c2', membershipAccountId: 'acct_2', periodKey: '2025-Q1', requiredCents: 50000, satisfiedCents: 30000, shortfallCents: 20000, compliancePct: '60.00', status: 'compliant' },
        { id: 'c3', membershipAccountId: 'acct_3', periodKey: '2025-Q1', requiredCents: 50000, satisfiedCents: 10000, shortfallCents: 40000, compliancePct: '20.00', status: 'non_compliant' },
      ]);

      const result = await getMembershipComplianceReport({ tenantId: TENANT_A, periodKey: '2025-Q1' });
      expect(result.entries).toHaveLength(3);
      expect(result.totalAccounts).toBe(3);
      expect(result.compliantCount).toBe(2);
      expect(result.nonCompliantCount).toBe(1);
    });
  });

  describe('getMembershipSpendReport', () => {
    it('returns entries with category totals', async () => {
      const { getMembershipSpendReport } = await import('../queries/get-membership-spend-report');

      mockSelectReturns.mockReturnValueOnce([
        { id: 's1', membershipAccountId: 'acct_1', periodKey: '2025-07', category: 'dining', spendCents: 15000, transactionCount: 5 },
        { id: 's2', membershipAccountId: 'acct_1', periodKey: '2025-07', category: 'golf', spendCents: 20000, transactionCount: 3 },
        { id: 's3', membershipAccountId: 'acct_2', periodKey: '2025-07', category: 'dining', spendCents: 10000, transactionCount: 2 },
      ]);

      const result = await getMembershipSpendReport({ tenantId: TENANT_A, periodKey: '2025-07' });
      expect(result.entries).toHaveLength(3);
      expect(result.grandTotalCents).toBe(45000);
      expect(result.categoryTotals['dining']).toBe(25000);
      expect(result.categoryTotals['golf']).toBe(20000);
    });
  });

  describe('getMembershipChurnReport', () => {
    it('returns entries with risk level counts', async () => {
      const { getMembershipChurnReport } = await import('../queries/get-membership-churn-report');

      mockSelectReturns.mockReturnValueOnce([
        { id: 'ch1', membershipAccountId: 'acct_1', riskScore: '15', riskLevel: 'low', daysSinceLastVisit: 5, visitTrend: 'stable', spendTrend: 'increasing', autopayFailures: 0, hasHold: false, hasLateFees: false, predictedChurnMonth: null, factorsJson: [] },
        { id: 'ch2', membershipAccountId: 'acct_2', riskScore: '75', riskLevel: 'critical', daysSinceLastVisit: 120, visitTrend: 'declining', spendTrend: 'declining', autopayFailures: 3, hasHold: true, hasLateFees: true, predictedChurnMonth: '2025-08', factorsJson: ['no_visit_90d', 'declining_visits'] },
      ]);

      const result = await getMembershipChurnReport({ tenantId: TENANT_A });
      expect(result.entries).toHaveLength(2);
      expect(result.lowCount).toBe(1);
      expect(result.criticalCount).toBe(1);
    });
  });

  describe('getMembershipPortfolioReport', () => {
    it('returns portfolio data', async () => {
      const { getMembershipPortfolioReport } = await import('../queries/get-membership-portfolio-report');

      mockSelectReturns.mockReturnValueOnce([{
        id: 'p1', asOfDate: '2025-07-01', totalAccounts: 100, activeAccounts: 85,
        suspendedAccounts: 5, frozenAccounts: 3, terminatedAccounts: 7,
        totalArCents: 5000000, totalDeferredRevenueCents: 2000000,
        avgAccountAgeDays: 450, newAccountsThisMonth: 3, terminatedThisMonth: 1,
        netMemberGrowth: 2, totalDuesRevenueCents: 3000000,
        totalInitiationRevenueCents: 500000, totalMinimumRevenueCents: 100000,
        totalLateFeeRevenueCents: 25000, autopayAdoptionPct: '72.50',
        avgCollectionDays: '18.5',
      }]);

      const result = await getMembershipPortfolioReport({ tenantId: TENANT_A, asOfDate: '2025-07-01' });
      expect(result).not.toBeNull();
      expect(result!.totalAccounts).toBe(100);
      expect(result!.activeAccounts).toBe(85);
      expect(result!.autopayAdoptionPct).toBe(72.5);
    });

    it('returns null when no data', async () => {
      const { getMembershipPortfolioReport } = await import('../queries/get-membership-portfolio-report');
      mockSelectReturns.mockReturnValueOnce([]);
      const result = await getMembershipPortfolioReport({ tenantId: TENANT_A });
      expect(result).toBeNull();
    });
  });

  describe('getMembershipPredictiveInsights', () => {
    it('returns churn insights when critical accounts exist', async () => {
      const { getMembershipPredictiveInsights } = await import('../queries/get-membership-predictive-insights');

      // First select: churn data (query filters for critical+high via inArray)
      mockSelectReturns.mockReturnValueOnce([
        { riskLevel: 'critical', riskScore: '80' },
        { riskLevel: 'high', riskScore: '55' },
      ]);
      // Second select: compliance data (query filters for non_compliant)
      mockSelectReturns.mockReturnValueOnce([
        { status: 'non_compliant' },
      ]);

      const result = await getMembershipPredictiveInsights({ tenantId: TENANT_A });
      expect(result.insights.length).toBeGreaterThanOrEqual(1);
      const churnInsight = result.insights.find(i => i.type === 'churn_risk');
      expect(churnInsight).toBeDefined();
      expect(churnInsight!.severity).toBe('critical');
      expect(churnInsight!.affectedAccountCount).toBe(2);
    });

    it('returns empty insights when all metrics are clean', async () => {
      const { getMembershipPredictiveInsights } = await import('../queries/get-membership-predictive-insights');

      // Churn: no critical/high (query returns empty because inArray filters)
      mockSelectReturns.mockReturnValueOnce([]);
      // Compliance: no non_compliant
      mockSelectReturns.mockReturnValueOnce([]);

      const result = await getMembershipPredictiveInsights({ tenantId: TENANT_A });
      expect(result.insights).toHaveLength(0);
    });
  });
});
