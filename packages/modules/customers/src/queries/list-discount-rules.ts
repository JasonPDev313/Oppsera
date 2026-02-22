import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { discountRules } from '@oppsera/db';

export interface ListDiscountRulesInput {
  tenantId: string;
  scopeType?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface DiscountRuleListEntry {
  id: string;
  scopeType: string;
  customerId: string | null;
  membershipClassId: string | null;
  segmentId: string | null;
  priority: number;
  name: string;
  description: string | null;
  isActive: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  ruleJson: Record<string, unknown>;
  createdAt: string;
}

export async function listDiscountRules(
  input: ListDiscountRulesInput,
): Promise<{ rules: DiscountRuleListEntry[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(discountRules.tenantId, input.tenantId)];

    if (input.scopeType) {
      conditions.push(eq(discountRules.scopeType, input.scopeType));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(discountRules.isActive, input.isActive));
    }

    if (input.cursor) {
      conditions.push(lt(discountRules.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: discountRules.id,
        scopeType: discountRules.scopeType,
        customerId: discountRules.customerId,
        membershipClassId: discountRules.membershipClassId,
        segmentId: discountRules.segmentId,
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
      .where(and(...conditions))
      .orderBy(desc(discountRules.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const rules: DiscountRuleListEntry[] = items.map((row) => ({
      id: row.id,
      scopeType: row.scopeType,
      customerId: row.customerId ?? null,
      membershipClassId: row.membershipClassId ?? null,
      segmentId: row.segmentId ?? null,
      priority: row.priority,
      name: row.name,
      description: row.description ?? null,
      isActive: row.isActive,
      effectiveDate: row.effectiveDate ?? null,
      expirationDate: row.expirationDate ?? null,
      ruleJson: (row.ruleJson ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));

    return { rules, cursor: nextCursor, hasMore };
  });
}
