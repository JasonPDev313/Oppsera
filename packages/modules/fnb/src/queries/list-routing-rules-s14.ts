import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListRoutingRulesS14Input } from '../validation';

export interface RoutingRuleS14Item {
  ruleId: string;
  locationId: string;
  stationId: string | null;
  printerId: string;
  printJobType: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

export async function listRoutingRulesS14(
  input: ListRoutingRulesS14Input,
): Promise<RoutingRuleS14Item[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
    ];

    if (input.stationId) {
      conditions.push(sql`station_id = ${input.stationId}`);
    }
    if (input.printJobType) {
      conditions.push(sql`print_job_type = ${input.printJobType}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, location_id, station_id, printer_id, print_job_type, priority, is_active, created_at
          FROM fnb_print_routing_rules
          WHERE ${whereClause}
          ORDER BY priority DESC, created_at ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      ruleId: r.id as string,
      locationId: r.location_id as string,
      stationId: (r.station_id as string) ?? null,
      printerId: r.printer_id as string,
      printJobType: r.print_job_type as string,
      priority: r.priority as number,
      isActive: r.is_active as boolean,
      createdAt: String(r.created_at),
    }));
  });
}
