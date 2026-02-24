import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsPricingRules } from '@oppsera/db';

export interface PricingRuleDetail {
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
  createdBy: string | null;
}

export async function getPricingRule(
  tenantId: string,
  id: string,
): Promise<PricingRuleDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsPricingRules)
      .where(and(eq(pmsPricingRules.id, id), eq(pmsPricingRules.tenantId, tenantId)))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      propertyId: row.propertyId,
      name: row.name,
      ruleType: row.ruleType,
      isActive: row.isActive,
      priority: row.priority,
      conditionsJson: (row.conditionsJson ?? {}) as Record<string, unknown>,
      adjustmentsJson: (row.adjustmentsJson ?? {}) as Record<string, unknown>,
      floorCents: row.floorCents,
      ceilingCents: row.ceilingCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
    };
  });
}
