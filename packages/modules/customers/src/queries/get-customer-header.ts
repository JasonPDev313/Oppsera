import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerEmails,
  customerPhones,
  customerMemberships,
  membershipPlans,
  billingAccounts,
  customerServiceFlags,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface CustomerHeaderData {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  memberNumber: string | null;
  status: string;
  type: string;
  profileImageUrl: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  primaryPhoneDisplay: string | null;
  totalSpend: number;
  totalVisits: number;
  lastVisitAt: string | null;
  loyaltyTier: string | null;
  taxExempt: boolean;
  ghinNumber: string | null;
  activeMembership: {
    planName: string;
    status: string;
  } | null;
  outstandingBalance: number;
  creditLimit: number;
  activeFlags: Array<{ id: string; flagType: string; severity: string }>;
}

export interface GetCustomerHeaderInput {
  tenantId: string;
  customerId: string;
}

export async function getCustomerHeader(
  input: GetCustomerHeaderInput,
): Promise<CustomerHeaderData> {
  return withTenant(input.tenantId, async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Fetch header-critical data in parallel
    const [primaryEmailRows, primaryPhoneRows, membershipRows, billingRows, flagRows] =
      await Promise.all([
        tx
          .select({ email: customerEmails.email })
          .from(customerEmails)
          .where(
            and(
              eq(customerEmails.tenantId, input.tenantId),
              eq(customerEmails.customerId, input.customerId),
              eq(customerEmails.isPrimary, true),
            ),
          )
          .limit(1),
        tx
          .select({
            phoneE164: customerPhones.phoneE164,
            phoneDisplay: customerPhones.phoneDisplay,
          })
          .from(customerPhones)
          .where(
            and(
              eq(customerPhones.tenantId, input.tenantId),
              eq(customerPhones.customerId, input.customerId),
              eq(customerPhones.isPrimary, true),
            ),
          )
          .limit(1),
        tx
          .select({
            planName: membershipPlans.name,
            status: customerMemberships.status,
          })
          .from(customerMemberships)
          .innerJoin(
            membershipPlans,
            eq(customerMemberships.planId, membershipPlans.id),
          )
          .where(
            and(
              eq(customerMemberships.tenantId, input.tenantId),
              eq(customerMemberships.customerId, input.customerId),
              eq(customerMemberships.status, 'active'),
            ),
          )
          .limit(1),
        tx
          .select({
            currentBalanceCents: billingAccounts.currentBalanceCents,
            creditLimitCents: billingAccounts.creditLimitCents,
          })
          .from(billingAccounts)
          .where(
            and(
              eq(billingAccounts.tenantId, input.tenantId),
              eq(billingAccounts.primaryCustomerId, input.customerId),
            ),
          ),
        tx
          .select({
            id: customerServiceFlags.id,
            flagType: customerServiceFlags.flagType,
            severity: customerServiceFlags.severity,
          })
          .from(customerServiceFlags)
          .where(
            and(
              eq(customerServiceFlags.tenantId, input.tenantId),
              eq(customerServiceFlags.customerId, input.customerId),
            ),
          ),
      ]);

    // Aggregate billing totals (cents → dollars)
    let outstandingBalance = 0;
    let creditLimit = 0;
    for (const ba of billingRows) {
      outstandingBalance += Number(ba.currentBalanceCents ?? 0) / 100;
      creditLimit += Number(ba.creditLimitCents ?? 0) / 100;
    }

    const primaryEmail =
      primaryEmailRows[0]?.email ?? customer.email ?? null;
    const primaryPhone =
      primaryPhoneRows[0]?.phoneE164 ?? customer.phone ?? null;
    const primaryPhoneDisplay =
      primaryPhoneRows[0]?.phoneDisplay ?? null;

    return {
      id: customer.id,
      displayName: customer.displayName,
      firstName: customer.firstName,
      lastName: customer.lastName,
      memberNumber: customer.memberNumber ?? null,
      status: customer.status,
      type: customer.type,
      profileImageUrl: (customer.metadata as Record<string, unknown>)
        ?.profileImageUrl as string | null ?? null,
      primaryEmail,
      primaryPhone,
      primaryPhoneDisplay,
      totalSpend: customer.totalSpend,
      totalVisits: customer.totalVisits,
      lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
      loyaltyTier: customer.loyaltyTier ?? null,
      taxExempt: customer.taxExempt,
      ghinNumber: customer.ghinNumber ?? null,
      activeMembership: membershipRows[0]
        ? { planName: membershipRows[0].planName, status: membershipRows[0].status }
        : null,
      outstandingBalance,
      creditLimit,
      activeFlags: flagRows.map((f) => ({
        id: f.id,
        flagType: f.flagType,
        severity: f.severity,
      })),
    };
  });
}
