import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { CreateAutoGratuityRuleInput } from '../validation';

export async function createAutoGratuityRule(
  ctx: RequestContext,
  locationId: string,
  input: CreateAutoGratuityRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createAutoGratuityRule');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    const [created] = await tx.execute(
      sql`INSERT INTO fnb_auto_gratuity_rules (
            tenant_id, location_id, name, party_size_threshold,
            gratuity_percentage, is_taxable, is_active
          )
          VALUES (
            ${ctx.tenantId}, ${locationId}, ${input.name},
            ${input.partySizeThreshold}, ${input.gratuityPercentage},
            ${input.isTaxable ?? false}, ${input.isActive ?? true}
          )
          RETURNING *`,
    );

    const raw = created as Record<string, unknown>;

    // Drizzle returns NUMERIC columns as strings — convert to numbers for callers
    const row = {
      ...raw,
      partySizeThreshold: raw.party_size_threshold != null ? Number(raw.party_size_threshold) : null,
      gratuityPercentage: raw.gratuity_percentage != null ? Number(raw.gratuity_percentage) : null,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createAutoGratuityRule', row);
    }

    return { result: row, events: [] };
  });

  await auditLog(ctx, 'fnb.auto_gratuity_rule.created', 'fnb_auto_gratuity_rules', (result as Record<string, unknown>).id as string);
  return result;
}
