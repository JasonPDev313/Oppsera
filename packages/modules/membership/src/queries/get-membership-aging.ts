import { eq, and, desc } from 'drizzle-orm';
import { withTenant, rmMembershipAging } from '@oppsera/db';

export interface GetMembershipAgingInput {
  tenantId: string;
  asOfDate?: string;
}

export interface MembershipAgingEntry {
  id: string;
  membershipAccountId: string;
  asOfDate: string;
  currentCents: number;
  days1To30Cents: number;
  days31To60Cents: number;
  days61To90Cents: number;
  daysOver90Cents: number;
  totalOutstandingCents: number;
  lastPaymentDate: string | null;
}

export interface MembershipAgingResult {
  entries: MembershipAgingEntry[];
  totalCurrentCents: number;
  total1To30Cents: number;
  total31To60Cents: number;
  total61To90Cents: number;
  totalOver90Cents: number;
  grandTotalCents: number;
}

export async function getMembershipAging(input: GetMembershipAgingInput): Promise<MembershipAgingResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(rmMembershipAging.tenantId, input.tenantId)];
    if (input.asOfDate) {
      conditions.push(eq(rmMembershipAging.asOfDate, input.asOfDate));
    }
    const rows = await (tx as any).select().from(rmMembershipAging).where(and(...conditions)).orderBy(desc(rmMembershipAging.totalOutstandingCents));
    let totalCurrentCents = 0, total1To30Cents = 0, total31To60Cents = 0, total61To90Cents = 0, totalOver90Cents = 0;
    const entries = (rows as any[]).map((r) => {
      const cur = Number(r.currentCents ?? 0);
      const d30 = Number(r.days1To30Cents ?? 0);
      const d60 = Number(r.days31To60Cents ?? 0);
      const d90 = Number(r.days61To90Cents ?? 0);
      const over90 = Number(r.daysOver90Cents ?? 0);
      totalCurrentCents += cur; total1To30Cents += d30; total31To60Cents += d60; total61To90Cents += d90; totalOver90Cents += over90;
      return { id: String(r.id), membershipAccountId: String(r.membershipAccountId), asOfDate: String(r.asOfDate ?? ''), currentCents: cur, days1To30Cents: d30, days31To60Cents: d60, days61To90Cents: d90, daysOver90Cents: over90, totalOutstandingCents: Number(r.totalOutstandingCents ?? 0), lastPaymentDate: r.lastPaymentDate ? String(r.lastPaymentDate) : null };
    });
    return { entries, totalCurrentCents, total1To30Cents, total31To60Cents, total61To90Cents, totalOver90Cents, grandTotalCents: totalCurrentCents + total1To30Cents + total31To60Cents + total61To90Cents + totalOver90Cents };
  });
}
