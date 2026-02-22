import { eq, and, desc } from 'drizzle-orm';
import { withTenant, rmMembershipChurn } from '@oppsera/db';

export interface GetMembershipChurnReportInput {
  tenantId: string;
  riskLevel?: string;
}

export interface MembershipChurnEntry {
  id: string;
  membershipAccountId: string;
  riskScore: number;
  riskLevel: string;
  daysSinceLastVisit: number;
  visitTrend: string;
  spendTrend: string;
  autopayFailures: number;
  hasHold: boolean;
  hasLateFees: boolean;
  predictedChurnMonth: string | null;
  factorsJson: unknown;
}

export interface MembershipChurnReport {
  entries: MembershipChurnEntry[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export async function getMembershipChurnReport(input: GetMembershipChurnReportInput): Promise<MembershipChurnReport> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(rmMembershipChurn.tenantId, input.tenantId)];
    if (input.riskLevel) { conditions.push(eq(rmMembershipChurn.riskLevel, input.riskLevel)); }
    const rows = await (tx as any).select().from(rmMembershipChurn).where(and(...conditions)).orderBy(desc(rmMembershipChurn.riskScore));
    const entries = (rows as any[]).map((r) => ({
      id: String(r.id), membershipAccountId: String(r.membershipAccountId),
      riskScore: Number(r.riskScore ?? 0), riskLevel: String(r.riskLevel ?? 'low'),
      daysSinceLastVisit: Number(r.daysSinceLastVisit ?? 0),
      visitTrend: String(r.visitTrend ?? 'stable'), spendTrend: String(r.spendTrend ?? 'stable'),
      autopayFailures: Number(r.autopayFailures ?? 0),
      hasHold: Boolean(r.hasHold), hasLateFees: Boolean(r.hasLateFees),
      predictedChurnMonth: r.predictedChurnMonth ? String(r.predictedChurnMonth) : null,
      factorsJson: r.factorsJson ?? null,
    }));
    let criticalCount = 0, highCount = 0, mediumCount = 0, lowCount = 0;
    for (const e of entries) {
      if (e.riskLevel === 'critical') criticalCount++;
      else if (e.riskLevel === 'high') highCount++;
      else if (e.riskLevel === 'medium') mediumCount++;
      else lowCount++;
    }
    return { entries, criticalCount, highCount, mediumCount, lowCount };
  });
}
