import { eq, and, desc } from 'drizzle-orm';
import { withTenant, rmMembershipSpend } from '@oppsera/db';

export interface GetMembershipSpendReportInput {
  tenantId: string;
  periodKey?: string;
  membershipAccountId?: string;
}

export interface MembershipSpendEntry {
  id: string;
  membershipAccountId: string;
  periodKey: string;
  category: string;
  spendCents: number;
  transactionCount: number;
}

export interface MembershipSpendReport {
  entries: MembershipSpendEntry[];
  categoryTotals: Record<string, number>;
  grandTotalCents: number;
}

export async function getMembershipSpendReport(input: GetMembershipSpendReportInput): Promise<MembershipSpendReport> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(rmMembershipSpend.tenantId, input.tenantId)];
    if (input.periodKey) { conditions.push(eq(rmMembershipSpend.periodKey, input.periodKey)); }
    if (input.membershipAccountId) { conditions.push(eq(rmMembershipSpend.membershipAccountId, input.membershipAccountId)); }
    const rows = await (tx as any).select().from(rmMembershipSpend).where(and(...conditions)).orderBy(desc(rmMembershipSpend.spendCents));
    const entries = (rows as any[]).map((r) => ({
      id: String(r.id), membershipAccountId: String(r.membershipAccountId),
      periodKey: String(r.periodKey), category: String(r.category ?? 'uncategorized'),
      spendCents: Number(r.spendCents ?? 0), transactionCount: Number(r.transactionCount ?? 0),
    }));
    const categoryTotals: Record<string, number> = {};
    let grandTotalCents = 0;
    for (const e of entries) { categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + e.spendCents; grandTotalCents += e.spendCents; }
    return { entries, categoryTotals, grandTotalCents };
  });
}
