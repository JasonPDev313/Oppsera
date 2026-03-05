import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipAccounts, membershipMembers, membershipSubscriptions, membershipPlans } from '@oppsera/db';

export interface GetMemberPortalAccountInput {
  tenantId: string;
  customerId: string;
}

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

export async function getMemberPortalAccount(
  input: GetMemberPortalAccountInput,
): Promise<MemberPortalAccount | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Find membership via membership_members -> membership_accounts
    const rows = await (tx as any)
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

    const arr = Array.isArray(rows) ? rows : [];
    if (arr.length === 0) return null;
    const r = arr[0];

    const accountId = String(r.accountId);

    // Look up active subscription → plan name
    let planName: string | null = null;
    const subRows = await (tx as any)
      .select({ planName: membershipPlans.name })
      .from(membershipSubscriptions)
      .innerJoin(membershipPlans, eq(membershipSubscriptions.planId, membershipPlans.id))
      .where(
        and(
          eq(membershipSubscriptions.tenantId, input.tenantId),
          eq(membershipSubscriptions.membershipAccountId, accountId),
          eq(membershipSubscriptions.status, 'active'),
        ),
      )
      .limit(1);
    const subArr = Array.isArray(subRows) ? subRows : [];
    if (subArr.length > 0) planName = subArr[0].planName ?? null;

    // Look up current AR balance (sum of outstanding statement lines)
    let currentBalanceCents = 0;
    const balanceRows = await (tx as any).execute(sql`
      SELECT COALESCE(SUM(sl.amount_cents), 0) AS balance
      FROM statement_lines sl
      JOIN statements s ON s.id = sl.statement_id AND s.tenant_id = sl.tenant_id
      WHERE sl.tenant_id = ${input.tenantId}
        AND s.membership_account_id = ${accountId}
        AND s.status != 'void'
    `);
    const balArr = Array.from(balanceRows as Iterable<{ balance: string }>);
    if (balArr.length > 0) currentBalanceCents = Number(balArr[0]!.balance) || 0;

    return {
      accountId,
      accountNumber: String(r.accountNumber ?? ''),
      status: String(r.status ?? 'unknown'),
      memberRole: String(r.memberRole ?? 'primary'),
      planName,
      currentBalanceCents,
      creditLimitCents: Number(r.creditLimitCents ?? 0),
      autopayEnabled: Boolean(r.autopayEnabled),
      statementDayOfMonth: Number(r.statementDayOfMonth ?? 1),
      startDate: r.startDate ? String(r.startDate) : null,
    };
  });
}
