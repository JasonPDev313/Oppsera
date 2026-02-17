import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerIdentifiers,
  customerActivityLog,
  customerMemberships,
  membershipPlans,
  billingAccounts,
  billingAccountMembers,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetCustomerInput {
  tenantId: string;
  customerId: string;
}

export interface CustomerDetail {
  customer: typeof customers.$inferSelect;
  identifiers: (typeof customerIdentifiers.$inferSelect)[];
  activityLog: (typeof customerActivityLog.$inferSelect)[];
  memberships: Array<
    typeof customerMemberships.$inferSelect & { planName: string }
  >;
  billingAccounts: (typeof billingAccounts.$inferSelect)[];
}

export async function getCustomer(input: GetCustomerInput): Promise<CustomerDetail> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch the customer
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

    if (!customer) {
      throw new NotFoundError('Customer', input.customerId);
    }

    // Fetch identifiers
    const identifiers = await tx
      .select()
      .from(customerIdentifiers)
      .where(
        and(
          eq(customerIdentifiers.tenantId, input.tenantId),
          eq(customerIdentifiers.customerId, input.customerId),
        ),
      );

    // Fetch activity log (last 20)
    const activityLog = await tx
      .select()
      .from(customerActivityLog)
      .where(
        and(
          eq(customerActivityLog.tenantId, input.tenantId),
          eq(customerActivityLog.customerId, input.customerId),
        ),
      )
      .orderBy(desc(customerActivityLog.createdAt))
      .limit(20);

    // Fetch active memberships with plan name
    const membershipRows = await tx
      .select({
        membership: customerMemberships,
        planName: membershipPlans.name,
      })
      .from(customerMemberships)
      .innerJoin(membershipPlans, eq(customerMemberships.planId, membershipPlans.id))
      .where(
        and(
          eq(customerMemberships.tenantId, input.tenantId),
          eq(customerMemberships.customerId, input.customerId),
          eq(customerMemberships.status, 'active'),
        ),
      );

    const memberships = membershipRows.map((row) => ({
      ...row.membership,
      planName: row.planName,
    }));

    // Fetch billing accounts where customer is primary
    const primaryAccounts = await tx
      .select()
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.tenantId, input.tenantId),
          eq(billingAccounts.primaryCustomerId, input.customerId),
        ),
      );

    // Fetch billing accounts where customer is a member
    const memberAccountLinks = await tx
      .select({ billingAccountId: billingAccountMembers.billingAccountId })
      .from(billingAccountMembers)
      .where(
        and(
          eq(billingAccountMembers.tenantId, input.tenantId),
          eq(billingAccountMembers.customerId, input.customerId),
        ),
      );

    const memberAccountIds = memberAccountLinks.map((l) => l.billingAccountId);
    const primaryAccountIds = new Set(primaryAccounts.map((a) => a.id));

    // Filter out accounts already included as primary
    const additionalIds = memberAccountIds.filter((id) => !primaryAccountIds.has(id));

    let memberAccounts: (typeof billingAccounts.$inferSelect)[] = [];
    if (additionalIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      memberAccounts = await tx
        .select()
        .from(billingAccounts)
        .where(
          and(
            eq(billingAccounts.tenantId, input.tenantId),
            inArray(billingAccounts.id, additionalIds),
          ),
        );
    }

    return {
      customer,
      identifiers,
      activityLog,
      memberships,
      billingAccounts: [...primaryAccounts, ...memberAccounts],
    };
  });
}
