import { eq, and, or, asc, isNull, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { discountRules } from '@oppsera/db';

export interface GetApplicableDiscountRulesInput {
  tenantId: string;
  customerId: string;
  membershipClassId?: string;
  segmentIds?: string[];
  asOfDate?: string; // defaults to today
}

export interface ApplicableDiscountRule {
  id: string;
  scopeType: string;
  priority: number;
  name: string;
  description: string | null;
  ruleJson: Record<string, unknown>;
  effectiveDate: string | null;
  expirationDate: string | null;
}

export async function getApplicableDiscountRules(
  input: GetApplicableDiscountRulesInput,
): Promise<{ rules: ApplicableDiscountRule[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);

    // Build scope conditions: customer-specific OR membership_class OR segment OR global
    const scopeConditions: ReturnType<typeof eq>[] = [
      // Customer-specific rules
      and(
        eq(discountRules.scopeType, 'customer'),
        eq(discountRules.customerId, input.customerId),
      )!,
      // Global rules
      eq(discountRules.scopeType, 'global'),
    ];

    if (input.membershipClassId) {
      scopeConditions.push(
        and(
          eq(discountRules.scopeType, 'membership_class'),
          eq(discountRules.membershipClassId, input.membershipClassId),
        )!,
      );
    }

    if (input.segmentIds && input.segmentIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      scopeConditions.push(
        and(
          eq(discountRules.scopeType, 'segment'),
          inArray(discountRules.segmentId, input.segmentIds),
        )!,
      );
    }

    const conditions = [
      eq(discountRules.tenantId, input.tenantId),
      eq(discountRules.isActive, true),
      or(...scopeConditions)!,
      // Filter out rules that haven't started yet
      or(
        isNull(discountRules.effectiveDate),
        sql`${discountRules.effectiveDate} <= ${asOfDate}::date`,
      )!,
      // Filter out expired rules
      or(
        isNull(discountRules.expirationDate),
        sql`${discountRules.expirationDate} >= ${asOfDate}::date`,
      )!,
    ];

    const rows = await tx
      .select({
        id: discountRules.id,
        scopeType: discountRules.scopeType,
        priority: discountRules.priority,
        name: discountRules.name,
        description: discountRules.description,
        ruleJson: discountRules.ruleJson,
        effectiveDate: discountRules.effectiveDate,
        expirationDate: discountRules.expirationDate,
      })
      .from(discountRules)
      .where(and(...conditions))
      .orderBy(asc(discountRules.priority), asc(discountRules.id));

    const rules: ApplicableDiscountRule[] = rows.map((row) => ({
      id: row.id,
      scopeType: row.scopeType,
      priority: row.priority,
      name: row.name,
      description: row.description ?? null,
      ruleJson: (row.ruleJson ?? {}) as Record<string, unknown>,
      effectiveDate: row.effectiveDate ?? null,
      expirationDate: row.expirationDate ?? null,
    }));

    return { rules };
  });
}
