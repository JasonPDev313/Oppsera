import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { AutoGratuityRuleNotFoundError } from '../errors';
import type { UpdateAutoGratuityRuleInput } from '../validation';

export async function updateAutoGratuityRule(
  ctx: RequestContext,
  ruleId: string,
  input: UpdateAutoGratuityRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateAutoGratuityRule');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Verify rule exists
    const existing = await tx.execute(
      sql`SELECT id FROM fnb_auto_gratuity_rules
          WHERE id = ${ruleId} AND tenant_id = ${ctx.tenantId}`,
    );
    if (Array.from(existing as Iterable<Record<string, unknown>>).length === 0) {
      throw new AutoGratuityRuleNotFoundError(ruleId);
    }

    const sets: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
    if (input.name !== undefined) sets.push(sql`name = ${input.name}`);
    if (input.partySizeThreshold !== undefined) sets.push(sql`party_size_threshold = ${input.partySizeThreshold}`);
    if (input.gratuityPercentage !== undefined) sets.push(sql`gratuity_percentage = ${input.gratuityPercentage}`);
    if (input.isTaxable !== undefined) sets.push(sql`is_taxable = ${input.isTaxable}`);
    if (input.isActive !== undefined) sets.push(sql`is_active = ${input.isActive}`);

    const setClauses = sql.join(sets, sql`, `);

    const [updated] = await tx.execute(
      sql`UPDATE fnb_auto_gratuity_rules
          SET ${setClauses}
          WHERE id = ${ruleId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    const row = updated as Record<string, unknown>;

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateAutoGratuityRule', row);
    }

    return { result: row, events: [] };
  });

  await auditLog(ctx, 'fnb.auto_gratuity_rule.updated', 'fnb_auto_gratuity_rules', ruleId);
  return result;
}
