import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsPricingRules } from '@oppsera/db';

export interface PricingRuleListItem {
  id: string;
  propertyId: string;
  name: string;
  ruleType: string;
  isActive: boolean;
  priority: number;
  conditionsJson: Record<string, unknown>;
  adjustmentsJson: Record<string, unknown>;
  floorCents: number | null;
  ceilingCents: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListPricingRulesResult {
  items: PricingRuleListItem[];
}

export async function listPricingRules(
  tenantId: string,
  propertyId: string,
  opts?: { isActive?: boolean },
): Promise<ListPricingRulesResult> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(pmsPricingRules.tenantId, tenantId),
      eq(pmsPricingRules.propertyId, propertyId),
    ];

    if (opts?.isActive !== undefined) {
      conditions.push(eq(pmsPricingRules.isActive, opts.isActive));
    }

    const rows = await tx
      .select()
      .from(pmsPricingRules)
      .where(and(...conditions))
      .orderBy(desc(pmsPricingRules.priority));

    return {
      items: rows.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        name: r.name,
        ruleType: r.ruleType,
        isActive: r.isActive,
        priority: r.priority,
        conditionsJson: (r.conditionsJson ?? {}) as Record<string, unknown>,
        adjustmentsJson: (r.adjustmentsJson ?? {}) as Record<string, unknown>,
        floorCents: r.floorCents,
        ceilingCents: r.ceilingCents,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });
}
