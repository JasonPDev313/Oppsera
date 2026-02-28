import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListRoutingRulesFilterInput } from '../validation';

export interface RoutingRuleListItem {
  id: string;
  ruleName: string | null;
  ruleType: string;
  catalogItemId: string | null;
  catalogItemName: string | null;
  modifierId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  subDepartmentId: string | null;
  subDepartmentName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  stationId: string;
  stationName: string | null;
  priority: number;
  orderTypeCondition: string | null;
  channelCondition: string | null;
  timeConditionStart: string | null;
  timeConditionEnd: string | null;
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
      sql`SELECT rr.id, rr.rule_name, rr.rule_type, rr.catalog_item_id, rr.modifier_id,
                 rr.department_id, rr.sub_department_id, rr.category_id, rr.station_id,
                 rr.priority, rr.is_active,
                 rr.order_type_condition, rr.channel_condition,
                 rr.time_condition_start, rr.time_condition_end,
                 ks.name AS station_name,
                 ci.name AS catalog_item_name,
                 dept.name AS department_name,
                 subdept.name AS sub_department_name,
                 cat.name AS category_name
          FROM fnb_kitchen_routing_rules rr
          LEFT JOIN fnb_kitchen_stations ks ON ks.id = rr.station_id
          LEFT JOIN catalog_items ci ON ci.id = rr.catalog_item_id
          LEFT JOIN catalog_categories dept ON dept.id = rr.department_id
          LEFT JOIN catalog_categories subdept ON subdept.id = rr.sub_department_id
          LEFT JOIN catalog_categories cat ON cat.id = rr.category_id
          WHERE ${whereClause}
          ORDER BY rr.priority DESC, rr.id ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      ruleName: (r.rule_name as string) ?? null,
      ruleType: r.rule_type as string,
      catalogItemId: (r.catalog_item_id as string) ?? null,
      catalogItemName: (r.catalog_item_name as string) ?? null,
      modifierId: (r.modifier_id as string) ?? null,
      departmentId: (r.department_id as string) ?? null,
      departmentName: (r.department_name as string) ?? null,
      subDepartmentId: (r.sub_department_id as string) ?? null,
      subDepartmentName: (r.sub_department_name as string) ?? null,
      categoryId: (r.category_id as string) ?? null,
      categoryName: (r.category_name as string) ?? null,
      stationId: r.station_id as string,
      stationName: (r.station_name as string) ?? null,
      priority: Number(r.priority),
      orderTypeCondition: (r.order_type_condition as string) ?? null,
      channelCondition: (r.channel_condition as string) ?? null,
      timeConditionStart: (r.time_condition_start as string) ?? null,
      timeConditionEnd: (r.time_condition_end as string) ?? null,
      isActive: r.is_active as boolean,
    }));
  });
}
