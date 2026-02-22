import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  membershipAccounts,
  membershipMembers,
  membershipClasses,
  membershipBillingItems,
  membershipAuthorizedUsers,
  customers,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetMembershipAccountInput {
  tenantId: string;
  accountId: string;
}

export interface MembershipAccountDetail {
  id: string;
  accountNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  primaryMemberId: string;
  primaryMemberName: string | null;
  billingEmail: string | null;
  billingAddressJson: Record<string, unknown> | null;
  statementDayOfMonth: number;
  paymentTermsDays: number;
  autopayEnabled: boolean;
  creditLimitCents: number;
  holdCharging: boolean;
  billingAccountId: string | null;
  customerId: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  members: MembershipMemberEntry[];
  classes: MembershipClassEntry[];
  billingItems: MembershipBillingItemEntry[];
  authorizedUsers: MembershipAuthorizedUserEntry[];
  createdAt: string;
}

export interface MembershipMemberEntry {
  id: string;
  customerId: string;
  customerName: string | null;
  role: string;
  memberNumber: string | null;
  status: string;
  chargePrivileges: Record<string, unknown> | null;
}

export interface MembershipClassEntry {
  id: string;
  className: string;
  effectiveDate: string;
  expirationDate: string | null;
  billedThroughDate: string | null;
  isArchived: boolean;
}

export interface MembershipBillingItemEntry {
  id: string;
  description: string;
  amountCents: number;
  discountCents: number;
  frequency: string;
  isActive: boolean;
  isSubMemberItem: boolean;
}

export interface MembershipAuthorizedUserEntry {
  id: string;
  name: string;
  relationship: string | null;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
}

export async function getMembershipAccount(
  input: GetMembershipAccountInput,
): Promise<MembershipAccountDetail> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch account with primary member name via LEFT JOIN
    const [account] = await (tx as any)
      .select({
        id: membershipAccounts.id,
        accountNumber: membershipAccounts.accountNumber,
        status: membershipAccounts.status,
        startDate: membershipAccounts.startDate,
        endDate: membershipAccounts.endDate,
        primaryMemberId: membershipAccounts.primaryMemberId,
        primaryMemberName: customers.displayName,
        billingEmail: membershipAccounts.billingEmail,
        billingAddressJson: membershipAccounts.billingAddressJson,
        statementDayOfMonth: membershipAccounts.statementDayOfMonth,
        paymentTermsDays: membershipAccounts.paymentTermsDays,
        autopayEnabled: membershipAccounts.autopayEnabled,
        creditLimitCents: membershipAccounts.creditLimitCents,
        holdCharging: membershipAccounts.holdCharging,
        billingAccountId: membershipAccounts.billingAccountId,
        customerId: membershipAccounts.customerId,
        notes: membershipAccounts.notes,
        metadata: membershipAccounts.metadata,
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
      .where(
        and(
          eq(membershipAccounts.tenantId, input.tenantId),
          eq(membershipAccounts.id, input.accountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('MembershipAccount', input.accountId);
    }

    // Fetch sub-resources in parallel
    const [memberRows, classRows, billingItemRows, authorizedUserRows] = await Promise.all([
      // Members with customer name resolution
      (tx as any)
        .select({
          id: membershipMembers.id,
          customerId: membershipMembers.customerId,
          customerName: customers.displayName,
          role: membershipMembers.role,
          memberNumber: membershipMembers.memberNumber,
          status: membershipMembers.status,
          chargePrivileges: membershipMembers.chargePrivileges,
        })
        .from(membershipMembers)
        .leftJoin(
          customers,
          and(
            eq(customers.id, membershipMembers.customerId),
            eq(customers.tenantId, membershipMembers.tenantId),
          ),
        )
        .where(
          and(
            eq(membershipMembers.tenantId, input.tenantId),
            eq(membershipMembers.membershipAccountId, input.accountId),
          ),
        )
        .orderBy(desc(membershipMembers.createdAt)),

      // Classes
      (tx as any)
        .select({
          id: membershipClasses.id,
          className: membershipClasses.className,
          effectiveDate: membershipClasses.effectiveDate,
          expirationDate: membershipClasses.expirationDate,
          billedThroughDate: membershipClasses.billedThroughDate,
          isArchived: membershipClasses.isArchived,
        })
        .from(membershipClasses)
        .where(
          and(
            eq(membershipClasses.tenantId, input.tenantId),
            eq(membershipClasses.membershipAccountId, input.accountId),
          ),
        )
        .orderBy(desc(membershipClasses.effectiveDate)),

      // Billing items
      (tx as any)
        .select({
          id: membershipBillingItems.id,
          description: membershipBillingItems.description,
          amountCents: membershipBillingItems.amountCents,
          discountCents: membershipBillingItems.discountCents,
          frequency: membershipBillingItems.frequency,
          isActive: membershipBillingItems.isActive,
          isSubMemberItem: membershipBillingItems.isSubMemberItem,
        })
        .from(membershipBillingItems)
        .where(
          and(
            eq(membershipBillingItems.tenantId, input.tenantId),
            eq(membershipBillingItems.membershipAccountId, input.accountId),
          ),
        )
        .orderBy(desc(membershipBillingItems.createdAt)),

      // Authorized users
      (tx as any)
        .select({
          id: membershipAuthorizedUsers.id,
          name: membershipAuthorizedUsers.name,
          relationship: membershipAuthorizedUsers.relationship,
          status: membershipAuthorizedUsers.status,
          effectiveDate: membershipAuthorizedUsers.effectiveDate,
          expirationDate: membershipAuthorizedUsers.expirationDate,
        })
        .from(membershipAuthorizedUsers)
        .where(
          and(
            eq(membershipAuthorizedUsers.tenantId, input.tenantId),
            eq(membershipAuthorizedUsers.membershipAccountId, input.accountId),
          ),
        )
        .orderBy(desc(membershipAuthorizedUsers.createdAt)),
    ]);

    // Map members
    const members: MembershipMemberEntry[] = (memberRows as any[]).map((row) => ({
      id: String(row.id),
      customerId: String(row.customerId),
      customerName: row.customerName ? String(row.customerName) : null,
      role: String(row.role),
      memberNumber: row.memberNumber ? String(row.memberNumber) : null,
      status: String(row.status),
      chargePrivileges: (row.chargePrivileges as Record<string, unknown>) ?? null,
    }));

    // Map classes
    const classes: MembershipClassEntry[] = (classRows as any[]).map((row) => ({
      id: String(row.id),
      className: String(row.className),
      effectiveDate: row.effectiveDate instanceof Date
        ? row.effectiveDate.toISOString()
        : String(row.effectiveDate),
      expirationDate: row.expirationDate instanceof Date
        ? row.expirationDate.toISOString()
        : (row.expirationDate ? String(row.expirationDate) : null),
      billedThroughDate: row.billedThroughDate instanceof Date
        ? row.billedThroughDate.toISOString()
        : (row.billedThroughDate ? String(row.billedThroughDate) : null),
      isArchived: Boolean(row.isArchived),
    }));

    // Map billing items
    const billingItems: MembershipBillingItemEntry[] = (billingItemRows as any[]).map((row) => ({
      id: String(row.id),
      description: String(row.description),
      amountCents: Number(row.amountCents),
      discountCents: Number(row.discountCents),
      frequency: String(row.frequency),
      isActive: Boolean(row.isActive),
      isSubMemberItem: Boolean(row.isSubMemberItem),
    }));

    // Map authorized users
    const authorizedUsers: MembershipAuthorizedUserEntry[] = (authorizedUserRows as any[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      relationship: row.relationship ? String(row.relationship) : null,
      status: String(row.status),
      effectiveDate: row.effectiveDate instanceof Date
        ? row.effectiveDate.toISOString()
        : (row.effectiveDate ? String(row.effectiveDate) : null),
      expirationDate: row.expirationDate instanceof Date
        ? row.expirationDate.toISOString()
        : (row.expirationDate ? String(row.expirationDate) : null),
    }));

    return {
      id: String(account.id),
      accountNumber: String(account.accountNumber),
      status: String(account.status),
      startDate: account.startDate instanceof Date
        ? account.startDate.toISOString()
        : String(account.startDate ?? ''),
      endDate: account.endDate instanceof Date
        ? account.endDate.toISOString()
        : (account.endDate ? String(account.endDate) : null),
      primaryMemberId: String(account.primaryMemberId ?? ''),
      primaryMemberName: account.primaryMemberName ? String(account.primaryMemberName) : null,
      billingEmail: account.billingEmail ? String(account.billingEmail) : null,
      billingAddressJson: (account.billingAddressJson as Record<string, unknown>) ?? null,
      statementDayOfMonth: Number(account.statementDayOfMonth ?? 1),
      paymentTermsDays: Number(account.paymentTermsDays ?? 30),
      autopayEnabled: Boolean(account.autopayEnabled),
      creditLimitCents: Number(account.creditLimitCents ?? 0),
      holdCharging: Boolean(account.holdCharging),
      billingAccountId: account.billingAccountId ? String(account.billingAccountId) : null,
      customerId: account.customerId ? String(account.customerId) : null,
      notes: account.notes ? String(account.notes) : null,
      metadata: (account.metadata as Record<string, unknown>) ?? null,
      members,
      classes,
      billingItems,
      authorizedUsers,
      createdAt: account.createdAt instanceof Date
        ? account.createdAt.toISOString()
        : String(account.createdAt),
    };
  });
}
