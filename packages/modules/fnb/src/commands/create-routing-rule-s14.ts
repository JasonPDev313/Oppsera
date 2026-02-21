import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { ulid } from '@oppsera/shared';
import type { CreateRoutingRuleS14Input } from '../validation';

export interface CreateRoutingRuleS14Result {
  ruleId: string;
  locationId: string;
  stationId: string | null;
  printerId: string;
  printJobType: string;
  priority: number;
}

export async function createRoutingRuleS14(
  ctx: RequestContext,
  input: CreateRoutingRuleS14Input,
): Promise<CreateRoutingRuleS14Result> {
  const ruleId = ulid();
  const priority = input.priority ?? 0;
  const stationId = input.stationId ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(
      sql`INSERT INTO fnb_print_routing_rules (id, tenant_id, location_id, station_id, printer_id, print_job_type, priority, is_active)
          VALUES (${ruleId}, ${ctx.tenantId}, ${input.locationId}, ${stationId}, ${input.printerId}, ${input.printJobType}, ${priority}, true)
          RETURNING id, location_id, station_id, printer_id, print_job_type, priority`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    const r = results[0]!;

    return {
      result: {
        ruleId: r.id as string,
        locationId: r.location_id as string,
        stationId: (r.station_id as string) ?? null,
        printerId: r.printer_id as string,
        printJobType: r.print_job_type as string,
        priority: r.priority as number,
      },
      events: [],
    };
  });

  await auditLog(ctx, 'fnb.routing_rule.created', 'fnb_print_routing_rule', result.ruleId);
  return result;
}
