import { eq, and, inArray } from 'drizzle-orm';
import { withTenant, rmMembershipChurn, rmMembershipCompliance } from '@oppsera/db';

export interface PredictiveInsight {
  type: 'churn_risk' | 'compliance_shortfall' | 'delinquency';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affectedAccountCount: number;
}

export interface GetMembershipPredictiveInsightsInput {
  tenantId: string;
}

export interface MembershipPredictiveInsightsResult {
  insights: PredictiveInsight[];
  generatedAt: string;
}

export async function getMembershipPredictiveInsights(input: GetMembershipPredictiveInsightsInput): Promise<MembershipPredictiveInsightsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const insights: PredictiveInsight[] = [];

    // 1. Check churn risk - find critical and high risk accounts
    const churnRows = await (tx as any).select().from(rmMembershipChurn)
      .where(and(eq(rmMembershipChurn.tenantId, input.tenantId), inArray(rmMembershipChurn.riskLevel, ['critical', 'high'])));
    const churnArr = Array.isArray(churnRows) ? churnRows : [];
    if (churnArr.length > 0) {
      const criticalCount = churnArr.filter((r) => r.riskLevel === 'critical').length;
      const highCount = churnArr.filter((r) => r.riskLevel === 'high').length;
      insights.push({
        type: 'churn_risk',
        severity: criticalCount > 0 ? 'critical' : 'warning',
        title: 'Members at risk of churning',
        description: criticalCount + ' critical and ' + highCount + ' high risk accounts detected',
        affectedAccountCount: churnArr.length,
      });
    }

    // 2. Check compliance - find non-compliant accounts
    const complianceRows = await (tx as any).select().from(rmMembershipCompliance)
      .where(and(eq(rmMembershipCompliance.tenantId, input.tenantId), eq(rmMembershipCompliance.status, 'non_compliant')));
    const compArr = Array.isArray(complianceRows) ? complianceRows : [];
    if (compArr.length > 0) {
      insights.push({
        type: 'compliance_shortfall',
        severity: 'warning',
        title: 'Members below minimum spend',
        description: compArr.length + ' accounts are non-compliant with minimum spend requirements',
        affectedAccountCount: compArr.length,
      });
    }

    return { insights, generatedAt: new Date().toISOString() };
  });
}
