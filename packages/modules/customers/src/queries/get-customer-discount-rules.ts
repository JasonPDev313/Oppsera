import { eq, and, or, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { discountRules, customerSegmentMemberships } from '@oppsera/db';

export interface GetCustomerDiscountRulesInput {
  tenantId: string;
  customerId: string;
}

export interface CustomerDiscountRuleEntry {
  id: string;
  scopeType: string;
  priority: number;
  name: string;
  description: string | null;
  isActive: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  ruleJson: Record<string, unknown>;
  createdAt: string;
}

/**
 * Returns all discount rules that apply to a given customer.
 * Includes:
 * - Global rules
 * - Customer-specific rules (scope=customer, customerId matches)
 * - Segment rules (scope=segment, customer is in that segment)
 *
 * Only returns active rules. Sorted by priority (lower = higher priority).
 */
export async function getCustomerDiscountRules(
  input: GetCustomerDiscountRulesInput,
): Promise<{ rules: CustomerDiscountRuleEntry[] }> {
  return withTenant(input.tenantId, async (tx) => {
    // Get customer's segment IDs
    const segmentRows = await tx
      .select({ segmentId: customerSegmentMemberships.segmentId })
      .from(customerSegmentMemberships)
      .where(and(
        eq(customerSegmentMemberships.tenantId, input.tenantId),
        eq(customerSegmentMemberships.customerId, input.customerId),
      ));
    const segmentIds = segmentRows.map((r) => r.segmentId);

    // Build conditions: global OR customer-specific OR in segment
    const scopeConditions = [
      eq(discountRules.scopeType, 'global'),
      and(eq(discountRules.scopeType, 'customer'), eq(discountRules.customerId, input.customerId)),
    ];

    // Add segment conditions if customer is in any segments
    for (const segId of segmentIds) {
      scopeConditions.push(
        and(eq(discountRules.scopeType, 'segment'), eq(discountRules.segmentId, segId)),
      );
    }

    const rows = await tx
      .select({
        id: discountRules.id,
        scopeType: discountRules.scopeType,
        priority: discountRules.priority,
        name: discountRules.name,
        description: discountRules.description,
        isActive: discountRules.isActive,
        effectiveDate: discountRules.effectiveDate,
        expirationDate: discountRules.expirationDate,
        ruleJson: discountRules.ruleJson,
        createdAt: discountRules.createdAt,
      })
      .from(discountRules)
      .where(and(
        eq(discountRules.tenantId, input.tenantId),
        eq(discountRules.isActive, true),
        or(...scopeConditions),
      ));

    const rules: CustomerDiscountRuleEntry[] = rows
      .map((row) => ({
        id: row.id,
        scopeType: row.scopeType,
        priority: row.priority,
        name: row.name,
        description: row.description ?? null,
        isActive: row.isActive,
        effectiveDate: row.effectiveDate ?? null,
        expirationDate: row.expirationDate ?? null,
        ruleJson: (row.ruleJson ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      }))
      .sort((a, b) => a.priority - b.priority);

    return { rules };
  });
}
