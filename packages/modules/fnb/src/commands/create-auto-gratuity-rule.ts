import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { CreateAutoGratuityRuleInput } from '../validation';

export async function createAutoGratuityRule(
  ctx: RequestContext,
  locationId: string,
  input: CreateAutoGratuityRuleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createAutoGratuityRule');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
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

    const row = created as Record<string, unknown>;

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_PRESENTED, {
      // Re-use a generic event; real event would be a rule-created event
      // but the spec only defines payment-flow events. We'll emit nothing extra for rule CRUD.
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createAutoGratuityRule', row);
    }

    return { result: row, events: [] };
  });

  await auditLog(ctx, 'fnb.auto_gratuity_rule.created', 'fnb_auto_gratuity_rules', (result as Record<string, unknown>).id as string);
  return result;
}
