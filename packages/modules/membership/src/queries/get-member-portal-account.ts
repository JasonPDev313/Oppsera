import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipAccounts, membershipMembers } from '@oppsera/db';

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

    return {
      accountId: String(r.accountId),
      accountNumber: String(r.accountNumber ?? ''),
      status: String(r.status ?? 'unknown'),
      memberRole: String(r.memberRole ?? 'primary'),
      planName: null, // Would need subscription join; keep simple for V1
      currentBalanceCents: 0, // Would need AR query; placeholder for V1
      creditLimitCents: Number(r.creditLimitCents ?? 0),
      autopayEnabled: Boolean(r.autopayEnabled),
      statementDayOfMonth: Number(r.statementDayOfMonth ?? 1),
      startDate: r.startDate ? String(r.startDate) : null,
    };
  });
}
