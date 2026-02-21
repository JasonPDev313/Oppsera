import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListRoutingRulesFilterInput } from '../validation';

export interface RoutingRuleListItem {
  id: string;
  ruleType: string;
  catalogItemId: string | null;
  modifierId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  stationId: string;
  stationName: string | null;
  priority: number;
  isActive: boolean;
}

export async function listRoutingRules(
  input: ListRoutingRulesFilterInput,
): Promise<RoutingRuleListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`rr.tenant_id = ${input.tenantId}`,
      sql`rr.location_id = ${input.locationId}`,
    ];

    if (input.stationId) {
      conditions.push(sql`rr.station_id = ${input.stationId}`);
    }
    if (input.ruleType) {
      conditions.push(sql`rr.rule_type = ${input.ruleType}`);
    }
    if (input.isActive !== undefined) {
      conditions.push(sql`rr.is_active = ${input.isActive}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT rr.id, rr.rule_type, rr.catalog_item_id, rr.modifier_id,
                 rr.department_id, rr.sub_department_id, rr.station_id,
                 rr.priority, rr.is_active,
                 ks.name AS station_name
          FROM fnb_kitchen_routing_rules rr
          LEFT JOIN fnb_kitchen_stations ks ON ks.id = rr.station_id
          WHERE ${whereClause}
          ORDER BY rr.priority DESC, rr.id ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      ruleType: r.rule_type as string,
      catalogItemId: (r.catalog_item_id as string) ?? null,
      modifierId: (r.modifier_id as string) ?? null,
      departmentId: (r.department_id as string) ?? null,
      subDepartmentId: (r.sub_department_id as string) ?? null,
      stationId: r.station_id as string,
      stationName: (r.station_name as string) ?? null,
      priority: Number(r.priority),
      isActive: r.is_active as boolean,
    }));
  });
}
