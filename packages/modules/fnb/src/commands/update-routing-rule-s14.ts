import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import type { UpdateRoutingRuleS14Input } from '../validation';
import { PrintRoutingRuleNotFoundError } from '../errors';

export interface UpdateRoutingRuleS14Result {
  ruleId: string;
  printerId: string;
  priority: number;
  isActive: boolean;
}

export async function updateRoutingRuleS14(
  ctx: RequestContext,
  input: UpdateRoutingRuleS14Input,
): Promise<UpdateRoutingRuleS14Result> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

    if (input.printerId !== undefined) {
      setClauses.push(sql`printer_id = ${input.printerId}`);
    }
    if (input.priority !== undefined) {
      setClauses.push(sql`priority = ${input.priority}`);
    }
    if (input.isActive !== undefined) {
      setClauses.push(sql`is_active = ${input.isActive}`);
    }

    const setClause = sql.join(setClauses, sql`, `);

    const rows = await tx.execute(
      sql`UPDATE fnb_print_routing_rules
          SET ${setClause}
          WHERE id = ${input.ruleId}
            AND tenant_id = ${ctx.tenantId}
          RETURNING id, printer_id, priority, is_active`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) {
      throw new PrintRoutingRuleNotFoundError(input.ruleId);
    }

    const r = results[0]!;
    return {
      result: {
        ruleId: r.id as string,
        printerId: r.printer_id as string,
        priority: r.priority as number,
        isActive: r.is_active as boolean,
      },
      events: [],
    };
  });

  await auditLog(ctx, 'fnb.routing_rule.updated', 'fnb_print_routing_rule', result.ruleId);
  return result;
}
