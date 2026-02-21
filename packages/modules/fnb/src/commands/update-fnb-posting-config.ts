import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';

interface UpdateFnbPostingConfigInput {
  locationId: string;
  postingMode: string;
  enableAutoPosting: boolean;
  discountTreatment: string;
  compTreatment: string;
  serviceChargeTreatment: string;
}

export async function updateFnbPostingConfig(ctx: RequestContext, input: UpdateFnbPostingConfigInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const configJson = JSON.stringify({
      postingMode: input.postingMode,
      enableAutoPosting: input.enableAutoPosting,
      discountTreatment: input.discountTreatment,
      compTreatment: input.compTreatment,
      serviceChargeTreatment: input.serviceChargeTreatment,
    });

    // Upsert the posting config into fnb_settings (Session 12 table) or a general config approach
    // For now, store in fnb_gl_account_mappings with entity_type='posting_config'
    const rows = await tx.execute(
      sql`INSERT INTO fnb_gl_account_mappings (
            tenant_id, location_id, entity_type, entity_id, memo
          )
          VALUES (
            ${ctx.tenantId}, ${input.locationId}, 'posting_config', 'default', ${configJson}
          )
          ON CONFLICT (tenant_id, location_id, entity_type, entity_id)
          DO UPDATE SET memo = EXCLUDED.memo, updated_at = NOW()
          RETURNING id, location_id, entity_type, entity_id, memo`,
    );
    const config = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return { result: config, events: [] };
  });

  await auditLog(ctx, 'fnb.posting_config.updated', 'posting_config', input.locationId);
  return result;
}
