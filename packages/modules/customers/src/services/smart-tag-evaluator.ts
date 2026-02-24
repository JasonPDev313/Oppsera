import { eq, and, isNull, sql, gte, desc } from 'drizzle-orm';
import {
  customers,
  customerMemberships,
  billingAccounts,
  customerIncidents,
  customerVisits,
  customerTags,
} from '@oppsera/db';
import type {
  SmartTagConditionGroup,
  SmartTagCondition,
  SmartTagEvidence,
  ConditionMetric,
  ConditionOperator,
} from '../types/smart-tag-conditions';

// ── Condition Evaluator (pure function) ─────────────────────────────

export function evaluateCondition(
  actualValue: unknown,
  operator: ConditionOperator,
  threshold: unknown,
): boolean {
  if (operator === 'is_null') return actualValue == null;
  if (operator === 'is_not_null') return actualValue != null;

  if (actualValue == null) return false;

  const num = typeof actualValue === 'number' ? actualValue : Number(actualValue);
  const threshNum = typeof threshold === 'number' ? threshold : Number(threshold);

  switch (operator) {
    case 'gt':
      return num > threshNum;
    case 'gte':
      return num >= threshNum;
    case 'lt':
      return num < threshNum;
    case 'lte':
      return num <= threshNum;
    case 'eq':
      return typeof actualValue === 'boolean'
        ? actualValue === threshold
        : typeof actualValue === 'string'
          ? actualValue === threshold
          : num === threshNum;
    case 'neq':
      return typeof actualValue === 'boolean'
        ? actualValue !== threshold
        : typeof actualValue === 'string'
          ? actualValue !== threshold
          : num !== threshNum;
    case 'between': {
      const range = threshold as [number, number];
      return num >= range[0] && num <= range[1];
    }
    case 'in': {
      const list = threshold as string[];
      return list.includes(String(actualValue));
    }
    case 'not_in': {
      const list = threshold as string[];
      return !list.includes(String(actualValue));
    }
    case 'contains': {
      return String(actualValue).toLowerCase().includes(String(threshold).toLowerCase());
    }
    default:
      return false;
  }
}

// ── Evaluate a single condition group (all must pass = AND) ─────────

export function evaluateConditionGroup(
  group: SmartTagCondition[],
  metricValues: Map<string, unknown>,
): { passed: boolean; details: SmartTagEvidence['conditions'] } {
  const details: SmartTagEvidence['conditions'] = [];
  let allPassed = true;

  for (const cond of group) {
    const actualValue = metricValues.get(cond.metric);
    const passed = evaluateCondition(actualValue, cond.operator, cond.value);
    details.push({
      metric: cond.metric,
      operator: cond.operator,
      threshold: cond.value,
      actualValue: actualValue ?? null,
      passed,
    });
    if (!passed) allPassed = false;
  }

  return { passed: allPassed, details };
}

// ── Evaluate condition groups (OR across groups) ────────────────────

export function evaluateAllGroups(
  groups: SmartTagConditionGroup[],
  metricValues: Map<string, unknown>,
): { passed: boolean; evidence: SmartTagEvidence['conditions'] } {
  for (const group of groups) {
    const result = evaluateConditionGroup(group.conditions, metricValues);
    if (result.passed) {
      return { passed: true, evidence: result.details };
    }
  }

  // None passed — return details from last group for evidence
  const lastGroup = groups[groups.length - 1];
  if (!lastGroup) return { passed: false, evidence: [] };
  const result = evaluateConditionGroup(lastGroup.conditions, metricValues);
  return { passed: false, evidence: result.details };
}

// ── Metric Resolver ─────────────────────────────────────────────────

export async function resolveMetrics(
  tx: any,
  tenantId: string,
  customerId: string,
  neededMetrics: Set<string>,
): Promise<Map<string, unknown>> {
  const values = new Map<string, unknown>();

  // Fetch customer row if any customer-table metrics are needed
  const customerMetrics: ConditionMetric[] = [
    'total_visits', 'total_spend_cents', 'days_since_last_visit',
    'days_since_created', 'customer_status', 'customer_type',
    'has_email', 'has_phone', 'marketing_consent', 'tax_exempt',
    'birth_month', 'loyalty_points_balance', 'wallet_balance_cents',
    'avg_order_value_cents',
  ];

  const needsCustomer = customerMetrics.some((m) => neededMetrics.has(m));

  if (needsCustomer) {
    const [cust] = await tx
      .select({
        totalVisits: customers.totalVisits,
        totalSpend: customers.totalSpend,
        lastVisitAt: customers.lastVisitAt,
        createdAt: customers.createdAt,
        status: customers.status,
        type: customers.type,
        email: customers.email,
        phone: customers.phone,
        marketingConsent: customers.marketingConsent,
        taxExempt: customers.taxExempt,
        dateOfBirth: customers.dateOfBirth,
        loyaltyPointsBalance: customers.loyaltyPointsBalance,
        walletBalanceCents: customers.walletBalanceCents,
      })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
      .limit(1);

    if (cust) {
      if (neededMetrics.has('total_visits')) values.set('total_visits', cust.totalVisits);
      if (neededMetrics.has('total_spend_cents')) values.set('total_spend_cents', cust.totalSpend);
      if (neededMetrics.has('avg_order_value_cents')) {
        values.set('avg_order_value_cents',
          cust.totalVisits > 0 ? Math.round(cust.totalSpend / cust.totalVisits) : 0);
      }
      if (neededMetrics.has('days_since_last_visit')) {
        values.set('days_since_last_visit',
          cust.lastVisitAt
            ? Math.floor((Date.now() - new Date(cust.lastVisitAt).getTime()) / 86400000)
            : null);
      }
      if (neededMetrics.has('days_since_created')) {
        values.set('days_since_created',
          Math.floor((Date.now() - new Date(cust.createdAt).getTime()) / 86400000));
      }
      if (neededMetrics.has('customer_status')) values.set('customer_status', cust.status);
      if (neededMetrics.has('customer_type')) values.set('customer_type', cust.type);
      if (neededMetrics.has('has_email')) values.set('has_email', !!cust.email);
      if (neededMetrics.has('has_phone')) values.set('has_phone', !!cust.phone);
      if (neededMetrics.has('marketing_consent')) values.set('marketing_consent', cust.marketingConsent);
      if (neededMetrics.has('tax_exempt')) values.set('tax_exempt', cust.taxExempt);
      if (neededMetrics.has('birth_month') && cust.dateOfBirth) {
        values.set('birth_month', new Date(cust.dateOfBirth).getMonth() + 1);
      }
      if (neededMetrics.has('loyalty_points_balance')) values.set('loyalty_points_balance', cust.loyaltyPointsBalance);
      if (neededMetrics.has('wallet_balance_cents')) values.set('wallet_balance_cents', cust.walletBalanceCents);
    }
  }

  // Visit window metrics (need to count from customerVisits table)
  const visitWindowMetrics: [ConditionMetric, number][] = [
    ['visits_last_30d', 30],
    ['visits_last_90d', 90],
    ['visits_last_365d', 365],
  ];

  for (const [metric, days] of visitWindowMetrics) {
    if (!neededMetrics.has(metric)) continue;
    const since = new Date(Date.now() - days * 86400000);
    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(customerVisits)
      .where(
        and(
          eq(customerVisits.tenantId, tenantId),
          eq(customerVisits.customerId, customerId),
          gte(customerVisits.checkInAt, since),
        ),
      );
    values.set(metric, result?.count ?? 0);
  }

  // Spend window metrics (need SUM from orders — approximate via totalSpend for now)
  // These are simplified: using totalSpend directly for total, visit-based approximation for windows
  const spendWindowMetrics: [ConditionMetric, number][] = [
    ['spend_last_30d_cents', 30],
    ['spend_last_90d_cents', 90],
    ['spend_last_365d_cents', 365],
  ];

  for (const [metric, days] of spendWindowMetrics) {
    if (!neededMetrics.has(metric)) continue;
    // Approximation: count visits in window / total visits * total spend
    const since = new Date(Date.now() - days * 86400000);
    const [visitCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(customerVisits)
      .where(
        and(
          eq(customerVisits.tenantId, tenantId),
          eq(customerVisits.customerId, customerId),
          gte(customerVisits.checkInAt, since),
        ),
      );
    // For spend windows, we'd ideally query orders. Since orders is a different module,
    // we use the visit proportion as an approximation.
    const [cust] = await tx
      .select({ totalVisits: customers.totalVisits, totalSpend: customers.totalSpend })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
      .limit(1);

    if (cust && cust.totalVisits > 0) {
      const proportion = (visitCount?.count ?? 0) / cust.totalVisits;
      values.set(metric, Math.round(cust.totalSpend * proportion));
    } else {
      values.set(metric, 0);
    }
  }

  // Membership metrics
  if (neededMetrics.has('membership_status') || neededMetrics.has('membership_plan_id') || neededMetrics.has('has_active_membership')) {
    const [mem] = await tx
      .select({
        status: customerMemberships.status,
        planId: customerMemberships.planId,
      })
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.tenantId, tenantId),
          eq(customerMemberships.customerId, customerId),
        ),
      )
      .orderBy(desc(customerMemberships.createdAt))
      .limit(1);

    if (mem) {
      if (neededMetrics.has('membership_status')) values.set('membership_status', mem.status);
      if (neededMetrics.has('membership_plan_id')) values.set('membership_plan_id', mem.planId);
      if (neededMetrics.has('has_active_membership')) values.set('has_active_membership', mem.status === 'active');
    } else {
      if (neededMetrics.has('membership_status')) values.set('membership_status', null);
      if (neededMetrics.has('membership_plan_id')) values.set('membership_plan_id', null);
      if (neededMetrics.has('has_active_membership')) values.set('has_active_membership', false);
    }
  }

  // Overdue balance
  if (neededMetrics.has('has_overdue_balance')) {
    const [ba] = await tx
      .select({ id: billingAccounts.id })
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.tenantId, tenantId),
          eq(billingAccounts.primaryCustomerId, customerId),
          sql`${billingAccounts.collectionStatus} != 'normal'`,
        ),
      )
      .limit(1);
    values.set('has_overdue_balance', !!ba);
  }

  // Open incidents
  if (neededMetrics.has('open_incident_count')) {
    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(customerIncidents)
      .where(
        and(
          eq(customerIncidents.tenantId, tenantId),
          eq(customerIncidents.customerId, customerId),
          eq(customerIncidents.status, 'open'),
        ),
      );
    values.set('open_incident_count', result?.count ?? 0);
  }

  return values;
}

// ── Extract needed metrics from condition groups ────────────────────

export function extractNeededMetrics(groups: SmartTagConditionGroup[]): Set<string> {
  const metrics = new Set<string>();
  for (const group of groups) {
    for (const cond of group.conditions) {
      metrics.add(cond.metric);
    }
  }
  return metrics;
}

// ── Build evidence object ───────────────────────────────────────────

export function buildEvidence(
  ruleId: string,
  ruleName: string,
  conditionDetails: SmartTagEvidence['conditions'],
): SmartTagEvidence {
  return {
    ruleId,
    ruleName,
    evaluatedAt: new Date().toISOString(),
    conditions: conditionDetails,
  };
}

// ── Evaluate a single customer for a single rule ────────────────────

export async function evaluateCustomerForRule(
  tx: any,
  tenantId: string,
  customerId: string,
  rule: {
    id: string;
    name: string;
    tagId: string;
    conditions: SmartTagConditionGroup[];
    autoRemove: boolean;
  },
): Promise<{ action: 'apply' | 'remove' | 'none'; evidence: SmartTagEvidence }> {
  const neededMetrics = extractNeededMetrics(rule.conditions);
  const metricValues = await resolveMetrics(tx, tenantId, customerId, neededMetrics);
  const { passed, evidence: conditionDetails } = evaluateAllGroups(rule.conditions, metricValues);
  const evidenceObj = buildEvidence(rule.id, rule.name, conditionDetails);

  // Check current tag state
  const [existing] = await tx
    .select({ id: customerTags.id })
    .from(customerTags)
    .where(
      and(
        eq(customerTags.tenantId, tenantId),
        eq(customerTags.customerId, customerId),
        eq(customerTags.tagId, rule.tagId),
        isNull(customerTags.removedAt),
      ),
    )
    .limit(1);

  const hasTag = !!existing;

  if (passed && !hasTag) {
    return { action: 'apply', evidence: evidenceObj };
  } else if (!passed && hasTag && rule.autoRemove) {
    return { action: 'remove', evidence: evidenceObj };
  }

  return { action: 'none', evidence: evidenceObj };
}
