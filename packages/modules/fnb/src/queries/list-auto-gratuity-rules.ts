import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListAutoGratuityRulesInput } from '../validation';

export interface AutoGratuityRuleItem {
  id: string;
  name: string;
  partySizeThreshold: number;
  gratuityPercentage: string;
  isTaxable: boolean;
  isActive: boolean;
  locationId: string | null;
}

export async function listAutoGratuityRules(
  input: ListAutoGratuityRulesInput,
): Promise<AutoGratuityRuleItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
    ];

    if (input.locationId) {
      conditions.push(sql`(location_id = ${input.locationId} OR location_id IS NULL)`);
    }
    if (input.isActive !== undefined) {
      conditions.push(sql`is_active = ${input.isActive}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, name, party_size_threshold, gratuity_percentage,
                 is_taxable, is_active, location_id
          FROM fnb_auto_gratuity_rules
          WHERE ${whereClause}
          ORDER BY party_size_threshold ASC, name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      partySizeThreshold: Number(r.party_size_threshold),
      gratuityPercentage: r.gratuity_percentage as string,
      isTaxable: r.is_taxable as boolean,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
    }));
  });
}
