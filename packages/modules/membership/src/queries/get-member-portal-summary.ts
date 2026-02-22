import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipMembers, membershipAccounts, statements, membershipSubscriptions } from '@oppsera/db';

export interface GetMemberPortalSummaryInput {
  tenantId: string;
  customerId: string;
}

export interface MemberPortalStatementSummary {
  id: string;
  statementNumber: string | null;
  periodStart: string;
  periodEnd: string;
  closingBalanceCents: number;
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

export async function getMemberPortalSummary(
  input: GetMemberPortalSummaryInput,
): Promise<MemberPortalSummary> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Find membership account via membership_members
    const memberRows = await (tx as any)
      .select({
        accountId: membershipAccounts.id,
        accountNumber: membershipAccounts.accountNumber,
        status: membershipAccounts.status,
        memberRole: membershipMembers.role,
        creditLimitCents: membershipAccounts.creditLimitCents,
        autopayEnabled: membershipAccounts.autopayEnabled,
        statementDayOfMonth: membershipAccounts.statementDayOfMonth,
        startDate: membershipAccounts.startDate,
      })
      .from(membershipMembers)
      .innerJoin(membershipAccounts, eq(membershipMembers.membershipAccountId, membershipAccounts.id))
      .where(
        and(
          eq(membershipMembers.tenantId, input.tenantId),
          eq(membershipMembers.customerId, input.customerId),
          eq(membershipMembers.status, 'active'),
        ),
      )
      .limit(1);

    const memberArr = Array.isArray(memberRows) ? memberRows : [];
    if (memberArr.length === 0) {
      return {
        accountId: null,
        accountNumber: null,
        accountStatus: null,
        memberRole: null,
        creditLimitCents: 0,
        autopayEnabled: false,
        statementDayOfMonth: 1,
        startDate: null,
        recentStatements: [],
        activeSubscriptionCount: 0,
      };
    }

    const member = memberArr[0];
    const accountId = String(member.accountId);

    // 2. Recent statements (last 5)
    const stmtRows = await (tx as any)
      .select({
        id: statements.id,
        statementNumber: statements.statementNumber,
        periodStart: statements.periodStart,
        periodEnd: statements.periodEnd,
        closingBalanceCents: statements.closingBalanceCents,
        status: statements.status,
        createdAt: statements.createdAt,
      })
      .from(statements)
      .where(
        and(
          eq(statements.tenantId, input.tenantId),
          eq(statements.membershipAccountId, accountId),
        ),
      )
      .orderBy(desc(statements.createdAt))
      .limit(5);

    const stmtArr = Array.isArray(stmtRows) ? stmtRows : [];
    const recentStatements: MemberPortalStatementSummary[] = stmtArr.map((s: any) => ({
      id: String(s.id),
      statementNumber: s.statementNumber ? String(s.statementNumber) : null,
      periodStart: s.periodStart instanceof Date ? s.periodStart.toISOString().slice(0, 10) : String(s.periodStart ?? ''),
      periodEnd: s.periodEnd instanceof Date ? s.periodEnd.toISOString().slice(0, 10) : String(s.periodEnd ?? ''),
      closingBalanceCents: Number(s.closingBalanceCents ?? 0),
      status: String(s.status ?? 'unknown'),
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt ?? ''),
    }));

    // 3. Active subscription count
    const subRows = await (tx as any)
      .select({ id: membershipSubscriptions.id })
      .from(membershipSubscriptions)
      .where(
        and(
          eq(membershipSubscriptions.tenantId, input.tenantId),
          eq(membershipSubscriptions.membershipAccountId, accountId),
          eq(membershipSubscriptions.status, 'active'),
        ),
      );

    const subArr = Array.isArray(subRows) ? subRows : [];

    return {
      accountId,
      accountNumber: String(member.accountNumber ?? ''),
      accountStatus: String(member.status ?? 'unknown'),
      memberRole: String(member.memberRole ?? 'primary'),
      creditLimitCents: Number(member.creditLimitCents ?? 0),
      autopayEnabled: Boolean(member.autopayEnabled),
      statementDayOfMonth: Number(member.statementDayOfMonth ?? 1),
      startDate: member.startDate ? String(member.startDate) : null,
      recentStatements,
      activeSubscriptionCount: subArr.length,
    };
  });
}
