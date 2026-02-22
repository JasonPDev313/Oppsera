import { eq, and, desc } from 'drizzle-orm';
import { withTenant, rmMembershipCompliance } from '@oppsera/db';

export interface GetMembershipComplianceReportInput {
  tenantId: string;
  periodKey?: string;
  status?: string;
}

export interface MembershipComplianceEntry {
  id: string;
  membershipAccountId: string;
  periodKey: string;
  requiredCents: number;
  satisfiedCents: number;
  shortfallCents: number;
  compliancePct: number;
  status: string;
}

export interface MembershipComplianceReport {
  entries: MembershipComplianceEntry[];
  totalAccounts: number;
  compliantCount: number;
  nonCompliantCount: number;
  avgCompliancePct: number;
}

export async function getMembershipComplianceReport(input: GetMembershipComplianceReportInput): Promise<MembershipComplianceReport> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(rmMembershipCompliance.tenantId, input.tenantId)];
    if (input.periodKey) { conditions.push(eq(rmMembershipCompliance.periodKey, input.periodKey)); }
    if (input.status) { conditions.push(eq(rmMembershipCompliance.status, input.status)); }
    const rows = await (tx as any).select().from(rmMembershipCompliance).where(and(...conditions)).orderBy(desc(rmMembershipCompliance.compliancePct));
    const entries = (rows as any[]).map((r) => ({
      id: String(r.id), membershipAccountId: String(r.membershipAccountId),
      periodKey: String(r.periodKey), requiredCents: Number(r.requiredCents ?? 0),
      satisfiedCents: Number(r.satisfiedCents ?? 0), shortfallCents: Number(r.shortfallCents ?? 0),
      compliancePct: Number(r.compliancePct ?? 0), status: String(r.status ?? 'unknown'),
    }));
    const totalAccounts = entries.length;
    const compliantCount = entries.filter((e) => e.status === 'compliant').length;
    const nonCompliantCount = entries.filter((e) => e.status === 'non_compliant').length;
    const avgCompliancePct = totalAccounts > 0 ? Math.round(entries.reduce((sum, e) => sum + e.compliancePct, 0) / totalAccounts) : 0;
    return { entries, totalAccounts, compliantCount, nonCompliantCount, avgCompliancePct };
  });
}
