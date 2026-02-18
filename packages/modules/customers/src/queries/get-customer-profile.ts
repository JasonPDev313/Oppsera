import { eq, and, desc, isNull, or } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerContacts,
  customerIdentifiers,
  customerServiceFlags,
  customerAlerts,
  customerHouseholds,
  customerHouseholdMembers,
  customerVisits,
  customerMetricsLifetime,
  customerMemberships,
  membershipPlans,
  customerRelationships,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetCustomerProfileInput {
  tenantId: string;
  customerId: string;
}

export interface CustomerProfileOverview {
  customer: typeof customers.$inferSelect;
  contacts: (typeof customerContacts.$inferSelect)[];
  identifiers: (typeof customerIdentifiers.$inferSelect)[];
  serviceFlags: (typeof customerServiceFlags.$inferSelect)[];
  activeAlerts: (typeof customerAlerts.$inferSelect)[];
  household: {
    households: Array<
      typeof customerHouseholds.$inferSelect & {
        members: (typeof customerHouseholdMembers.$inferSelect)[];
      }
    >;
  } | null;
  currentVisit: (typeof customerVisits.$inferSelect) | null;
  stats: {
    totalVisits: number;
    totalSpendCents: number;
    avgSpendCents: number;
    lifetimeValueCents: number;
    revenueByCategory: Record<string, number>;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    daysSinceLastVisit: number | null;
    visitFrequency: string;
    avgVisitDurationMinutes: number | null;
  };
  memberships: {
    active: (typeof customerMemberships.$inferSelect & { planName: string }) | null;
    history: (typeof customerMemberships.$inferSelect)[];
  };
  relationships: Array<typeof customerRelationships.$inferSelect>;
}

function computeVisitFrequency(
  totalVisits: number,
  firstVisitAt: string | null,
  lastVisitAt: string | null,
): string {
  if (!lastVisitAt) return 'new';
  const daysSinceLast = (Date.now() - new Date(lastVisitAt).getTime()) / 86400000;
  if (daysSinceLast > 90) return 'lapsed';
  if (totalVisits <= 1) return 'new';
  if (!firstVisitAt) return 'new';
  const totalDays =
    (new Date(lastVisitAt).getTime() - new Date(firstVisitAt).getTime()) / 86400000;
  const avg = totalDays / totalVisits;
  if (avg <= 10) return 'weekly';
  if (avg <= 21) return 'biweekly';
  if (avg <= 45) return 'monthly';
  return 'occasional';
}

export async function getCustomerProfile(
  input: GetCustomerProfileInput,
): Promise<CustomerProfileOverview> {
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

    // Fetch all independent queries in parallel (Group A)
    const [
      contacts,
      identifiers,
      serviceFlags,
      activeAlerts,
      currentVisitRows,
      householdMemberRows,
      metrics,
      activeMembershipRows,
      membershipHistory,
      relationships,
    ] = await Promise.all([
      // Fetch contacts
      tx
        .select()
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.tenantId, input.tenantId),
            eq(customerContacts.customerId, input.customerId),
          ),
        ),

      // Fetch identifiers
      tx
        .select()
        .from(customerIdentifiers)
        .where(
          and(
            eq(customerIdentifiers.tenantId, input.tenantId),
            eq(customerIdentifiers.customerId, input.customerId),
          ),
        ),

      // Fetch service flags
      tx
        .select()
        .from(customerServiceFlags)
        .where(
          and(
            eq(customerServiceFlags.tenantId, input.tenantId),
            eq(customerServiceFlags.customerId, input.customerId),
          ),
        ),

      // Fetch active alerts
      tx
        .select()
        .from(customerAlerts)
        .where(
          and(
            eq(customerAlerts.tenantId, input.tenantId),
            eq(customerAlerts.customerId, input.customerId),
            eq(customerAlerts.isActive, true),
          ),
        ),

      // Fetch current visit (checkOutAt IS NULL, ordered by checkInAt DESC, limit 1)
      tx
        .select()
        .from(customerVisits)
        .where(
          and(
            eq(customerVisits.tenantId, input.tenantId),
            eq(customerVisits.customerId, input.customerId),
            isNull(customerVisits.checkOutAt),
          ),
        )
        .orderBy(desc(customerVisits.checkInAt))
        .limit(1),

      // Fetch household memberships for this customer
      tx
        .select()
        .from(customerHouseholdMembers)
        .where(
          and(
            eq(customerHouseholdMembers.tenantId, input.tenantId),
            eq(customerHouseholdMembers.customerId, input.customerId),
            isNull(customerHouseholdMembers.leftAt),
          ),
        ),

      // Fetch customer_metrics_lifetime for stats
      tx
        .select()
        .from(customerMetricsLifetime)
        .where(
          and(
            eq(customerMetricsLifetime.tenantId, input.tenantId),
            eq(customerMetricsLifetime.customerId, input.customerId),
          ),
        )
        .limit(1),

      // Fetch active membership with plan name
      tx
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
        )
        .limit(1),

      // Fetch all membership history
      tx
        .select()
        .from(customerMemberships)
        .where(
          and(
            eq(customerMemberships.tenantId, input.tenantId),
            eq(customerMemberships.customerId, input.customerId),
          ),
        )
        .orderBy(desc(customerMemberships.createdAt)),

      // Fetch relationships
      tx
        .select()
        .from(customerRelationships)
        .where(
          and(
            eq(customerRelationships.tenantId, input.tenantId),
            or(
              eq(customerRelationships.parentCustomerId, input.customerId),
              eq(customerRelationships.childCustomerId, input.customerId),
            ),
          ),
        ),
    ]);

    const currentVisit = currentVisitRows[0] ?? null;

    // Group B: household details depend on householdMemberRows from Group A
    let household: CustomerProfileOverview['household'] = null;
    if (householdMemberRows.length > 0) {
      const { inArray } = await import('drizzle-orm');
      const householdIds = householdMemberRows.map((m) => m.householdId);

      const householdRows = await tx
        .select()
        .from(customerHouseholds)
        .where(
          and(
            eq(customerHouseholds.tenantId, input.tenantId),
            inArray(customerHouseholds.id, householdIds),
          ),
        );

      const allMembers = await tx
        .select()
        .from(customerHouseholdMembers)
        .where(
          and(
            eq(customerHouseholdMembers.tenantId, input.tenantId),
            inArray(customerHouseholdMembers.householdId, householdIds),
            isNull(customerHouseholdMembers.leftAt),
          ),
        );

      const membersByHousehold = new Map<
        string,
        (typeof customerHouseholdMembers.$inferSelect)[]
      >();
      for (const member of allMembers) {
        const existing = membersByHousehold.get(member.householdId) ?? [];
        existing.push(member);
        membersByHousehold.set(member.householdId, existing);
      }

      household = {
        households: householdRows.map((h) => ({
          ...h,
          members: membersByHousehold.get(h.id) ?? [],
        })),
      };
    }

    const metricsRow = metrics[0];

    const totalVisits = metricsRow?.totalVisits ?? 0;
    const totalSpendCents = metricsRow?.totalSpendCents ?? 0;
    const avgSpendCents = metricsRow?.avgSpendCents ?? 0;
    const lifetimeValueCents = metricsRow?.lifetimeValueCents ?? 0;
    const firstVisitAt = metricsRow?.firstVisitAt?.toISOString() ?? null;
    const lastVisitAt = metricsRow?.lastVisitAt?.toISOString() ?? null;
    const avgVisitDurationMinutes = metricsRow?.avgVisitDurationMinutes ?? null;
    const categoryBreakdown = (metricsRow?.categoryBreakdown ?? {}) as Record<string, number>;

    const daysSinceLastVisit = lastVisitAt
      ? Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / 86400000)
      : null;

    const visitFrequency = computeVisitFrequency(totalVisits, firstVisitAt, lastVisitAt);

    const stats = {
      totalVisits,
      totalSpendCents,
      avgSpendCents,
      lifetimeValueCents,
      revenueByCategory: categoryBreakdown,
      firstVisitAt,
      lastVisitAt,
      daysSinceLastVisit,
      visitFrequency,
      avgVisitDurationMinutes,
    };

    const activeMembership = activeMembershipRows.length > 0
      ? { ...activeMembershipRows[0]!.membership, planName: activeMembershipRows[0]!.planName }
      : null;

    return {
      customer,
      contacts,
      identifiers,
      serviceFlags,
      activeAlerts,
      household,
      currentVisit: currentVisit ?? null,
      stats,
      memberships: {
        active: activeMembership,
        history: membershipHistory,
      },
      relationships,
    };
  });
}
