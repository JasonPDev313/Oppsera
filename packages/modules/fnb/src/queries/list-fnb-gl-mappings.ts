import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListFnbGlMappingsInput } from '../validation';

export interface FnbGlMappingItem {
  id: string;
  locationId: string;
  entityType: string;
  entityId: string;
  revenueAccountId: string | null;
  expenseAccountId: string | null;
  liabilityAccountId: string | null;
  assetAccountId: string | null;
  contraRevenueAccountId: string | null;
  memo: string | null;
}

export async function listFnbGlMappings(
  input: ListFnbGlMappingsInput,
): Promise<FnbGlMappingItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
    ];

    if (input.entityType) {
      conditions.push(sql`entity_type = ${input.entityType}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, location_id, entity_type, entity_id,
                 revenue_account_id, expense_account_id, liability_account_id,
                 asset_account_id, contra_revenue_account_id, memo
          FROM fnb_gl_account_mappings
          WHERE ${whereClause}
          ORDER BY entity_type, entity_id`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      locationId: r.location_id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      revenueAccountId: (r.revenue_account_id as string) ?? null,
      expenseAccountId: (r.expense_account_id as string) ?? null,
      liabilityAccountId: (r.liability_account_id as string) ?? null,
      assetAccountId: (r.asset_account_id as string) ?? null,
      contraRevenueAccountId: (r.contra_revenue_account_id as string) ?? null,
      memo: (r.memo as string) ?? null,
    }));
  });
}
