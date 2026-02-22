import { eq, and, lt, desc, ilike, or, sql, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipAccounts, membershipMembers, customers } from '@oppsera/db';

export interface ListMembershipAccountsInput {
  tenantId: string;
  status?: string;
  customerId?: string; // filter accounts where this customer is primary member or a member
  cursor?: string;
  limit?: number;
  search?: string; // search by account number or primary member name
}

export interface MembershipAccountListEntry {
  id: string;
  accountNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  primaryMemberId: string;
  primaryMemberName: string | null;
  autopayEnabled: boolean;
  creditLimitCents: number;
  holdCharging: boolean;
  memberCount: number;
  createdAt: string;
}

export interface ListMembershipAccountsResult {
  accounts: MembershipAccountListEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listMembershipAccounts(
  input: ListMembershipAccountsInput,
): Promise<ListMembershipAccountsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(membershipAccounts.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      conditions.push(lt(membershipAccounts.id, input.cursor));
    }

    if (input.status) {
      conditions.push(eq(membershipAccounts.status, input.status));
    }

    if (input.customerId) {
      // Find accounts where the customer is either the primary member or a member
      conditions.push(
        or(
          eq(membershipAccounts.primaryMemberId, input.customerId),
          eq(membershipAccounts.customerId, input.customerId),
          inArray(
            membershipAccounts.id,
            sql`(SELECT membership_account_id FROM membership_members WHERE tenant_id = ${input.tenantId} AND customer_id = ${input.customerId})`,
          ),
        )!,
      );
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(membershipAccounts.accountNumber, pattern),
          ilike(customers.displayName, pattern),
        )!,
      );
    }

    // Fetch accounts with primary member name via LEFT JOIN
    const rows = await (tx as any)
      .select({
        id: membershipAccounts.id,
        accountNumber: membershipAccounts.accountNumber,
        status: membershipAccounts.status,
        startDate: membershipAccounts.startDate,
        endDate: membershipAccounts.endDate,
        primaryMemberId: membershipAccounts.primaryMemberId,
        primaryMemberName: customers.displayName,
        autopayEnabled: membershipAccounts.autopayEnabled,
        creditLimitCents: membershipAccounts.creditLimitCents,
        holdCharging: membershipAccounts.holdCharging,
        createdAt: membershipAccounts.createdAt,
      })
      .from(membershipAccounts)
      .leftJoin(
        customers,
        and(
          eq(customers.id, membershipAccounts.primaryMemberId),
          eq(customers.tenantId, membershipAccounts.tenantId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(membershipAccounts.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    // Batch-fetch member counts for all returned account IDs
    const accountIds = items.map((r: any) => r.id as string);
    const memberCountMap = new Map<string, number>();

    if (accountIds.length > 0) {
      const countRows = await tx.execute(
        sql`
          SELECT membership_account_id, COUNT(*)::int AS member_count
          FROM ${membershipMembers}
          WHERE tenant_id = ${input.tenantId}
            AND membership_account_id IN ${sql`(${sql.join(accountIds.map((id: string) => sql`${id}`), sql`, `)})`}
          GROUP BY membership_account_id
        `,
      );

      for (const row of Array.from(countRows as Iterable<Record<string, unknown>>)) {
        memberCountMap.set(
          String(row.membership_account_id),
          Number(row.member_count),
        );
      }
    }

    // Merge and map to output shape
    const accounts: MembershipAccountListEntry[] = items.map((row: any) => ({
      id: String(row.id),
      accountNumber: String(row.accountNumber),
      status: String(row.status),
      startDate: row.startDate instanceof Date ? row.startDate.toISOString() : String(row.startDate ?? ''),
      endDate: row.endDate instanceof Date ? row.endDate.toISOString() : (row.endDate ? String(row.endDate) : null),
      primaryMemberId: String(row.primaryMemberId ?? ''),
      primaryMemberName: row.primaryMemberName ? String(row.primaryMemberName) : null,
      autopayEnabled: Boolean(row.autopayEnabled),
      creditLimitCents: Number(row.creditLimitCents ?? 0),
      holdCharging: Boolean(row.holdCharging),
      memberCount: memberCountMap.get(String(row.id)) ?? 0,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));

    return { accounts, cursor: nextCursor, hasMore };
  });
}
