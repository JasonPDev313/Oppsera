import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerMemberships,
  membershipPlans,
  billingAccounts,
  arTransactions,
  customerServiceFlags,
  customerAlerts,
  customerMetricsLifetime,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface CustomerOverviewData {
  // Financial snapshot
  outstandingBalance: number;
  creditLimit: number;
  creditUtilization: number; // 0-100%
  totalSpend: number;
  totalVisits: number;
  lastVisitAt: string | null;

  // Membership snapshot
  activeMembership: {
    planName: string;
    status: string;
    startDate: string | null;
  } | null;

  // Recent activity
  recentTransactions: Array<{
    id: string;
    type: string;
    description: string;
    amountCents: number;
    createdAt: string;
  }>;

  // Flags & alerts
  activeFlags: Array<{
    id: string;
    flagType: string;
    severity: string;
    description: string | null;
  }>;
  activeAlerts: Array<{
    id: string;
    alertType: string;
    severity: string;
    title: string;
    message: string | null;
  }>;

  // Behavioral data
  lifetimeMetrics: {
    totalOrderCount: number;
    avgOrderValue: number;
    daysSinceLastVisit: number | null;
    topCategory: string | null;
    churnRiskScore: number | null;
  } | null;
}

export interface GetCustomerOverviewInput {
  tenantId: string;
  customerId: string;
}

export async function getCustomerOverview(
  input: GetCustomerOverviewInput,
): Promise<CustomerOverviewData> {
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

    const [
      membershipRows,
      billingRows,
      recentTxRows,
      flagRows,
      alertRows,
      lifetimeRows,
    ] = await Promise.all([
      tx
        .select({
          planName: membershipPlans.name,
          status: customerMemberships.status,
          startDate: customerMemberships.startDate,
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
          id: arTransactions.id,
          type: arTransactions.type,
          notes: arTransactions.notes,
          amountCents: arTransactions.amountCents,
          createdAt: arTransactions.createdAt,
        })
        .from(arTransactions)
        .where(
          and(
            eq(arTransactions.tenantId, input.tenantId),
            eq(arTransactions.customerId, input.customerId),
          ),
        )
        .orderBy(desc(arTransactions.createdAt))
        .limit(5),
      tx
        .select({
          id: customerServiceFlags.id,
          flagType: customerServiceFlags.flagType,
          severity: customerServiceFlags.severity,
          notes: customerServiceFlags.notes,
        })
        .from(customerServiceFlags)
        .where(
          and(
            eq(customerServiceFlags.tenantId, input.tenantId),
            eq(customerServiceFlags.customerId, input.customerId),
          ),
        ),
      tx
        .select({
          id: customerAlerts.id,
          alertType: customerAlerts.alertType,
          severity: customerAlerts.severity,
          message: customerAlerts.message,
          isActive: customerAlerts.isActive,
        })
        .from(customerAlerts)
        .where(
          and(
            eq(customerAlerts.tenantId, input.tenantId),
            eq(customerAlerts.customerId, input.customerId),
            eq(customerAlerts.isActive, true),
          ),
        )
        .limit(5),
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
    ]);

    // Aggregate billing (cents → dollars)
    let outstandingBalance = 0;
    let creditLimit = 0;
    for (const ba of billingRows) {
      outstandingBalance += Number(ba.currentBalanceCents ?? 0) / 100;
      creditLimit += Number(ba.creditLimitCents ?? 0) / 100;
    }
    const creditUtilization =
      creditLimit > 0
        ? Math.round((outstandingBalance / creditLimit) * 100)
        : 0;

    // Compute days since last visit
    let daysSinceLastVisit: number | null = null;
    if (customer.lastVisitAt) {
      const diff = Date.now() - new Date(customer.lastVisitAt).getTime();
      daysSinceLastVisit = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    const lifetime = lifetimeRows[0];
    const lifetimeMetrics = lifetime
      ? {
          totalOrderCount: lifetime.totalVisits,
          avgOrderValue: lifetime.avgSpendCents,
          daysSinceLastVisit,
          topCategory: lifetime.topCategory ?? null,
          churnRiskScore: null,
        }
      : {
          totalOrderCount: customer.totalVisits,
          avgOrderValue:
            customer.totalVisits > 0
              ? Math.round(customer.totalSpend / customer.totalVisits)
              : 0,
          daysSinceLastVisit,
          topCategory: null,
          churnRiskScore: null,
        };

    return {
      outstandingBalance,
      creditLimit,
      creditUtilization,
      totalSpend: customer.totalSpend,
      totalVisits: customer.totalVisits,
      lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
      activeMembership: membershipRows[0]
        ? {
            planName: membershipRows[0].planName,
            status: membershipRows[0].status,
            startDate: membershipRows[0].startDate ?? null,
          }
        : null,
      recentTransactions: recentTxRows.map((t) => ({
        id: t.id,
        type: t.type,
        description: t.notes ?? '',
        amountCents: Number(t.amountCents),
        createdAt: t.createdAt.toISOString(),
      })),
      activeFlags: flagRows.map((f) => ({
        id: f.id,
        flagType: f.flagType,
        severity: f.severity,
        description: f.notes ?? null,
      })),
      activeAlerts: alertRows.map((a) => ({
        id: a.id,
        alertType: a.alertType,
        severity: a.severity,
        title: a.alertType.replace(/_/g, ' '),
        message: a.message ?? null,
      })),
      lifetimeMetrics,
    };
  });
}
