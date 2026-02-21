import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';

interface ConfigureFnbGlMappingInput {
  locationId: string;
  entityType: string;
  entityId: string;
  revenueAccountId?: string;
  expenseAccountId?: string;
  liabilityAccountId?: string;
  assetAccountId?: string;
  contraRevenueAccountId?: string;
  memo?: string;
}

export async function configureFnbGlMapping(ctx: RequestContext, input: ConfigureFnbGlMappingInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Upsert mapping - use ON CONFLICT on (tenant_id, location_id, entity_type, entity_id)
    const rows = await tx.execute(
      sql`INSERT INTO fnb_gl_account_mappings (
            tenant_id, location_id, entity_type, entity_id,
            revenue_account_id, expense_account_id, liability_account_id,
            asset_account_id, contra_revenue_account_id, memo
          )
          VALUES (
            ${ctx.tenantId}, ${input.locationId}, ${input.entityType}, ${input.entityId},
            ${input.revenueAccountId ?? null}, ${input.expenseAccountId ?? null},
            ${input.liabilityAccountId ?? null}, ${input.assetAccountId ?? null},
            ${input.contraRevenueAccountId ?? null}, ${input.memo ?? null}
          )
          ON CONFLICT (tenant_id, location_id, entity_type, entity_id)
          DO UPDATE SET
            revenue_account_id = EXCLUDED.revenue_account_id,
            expense_account_id = EXCLUDED.expense_account_id,
            liability_account_id = EXCLUDED.liability_account_id,
            asset_account_id = EXCLUDED.asset_account_id,
            contra_revenue_account_id = EXCLUDED.contra_revenue_account_id,
            memo = EXCLUDED.memo,
            updated_at = NOW()
          RETURNING id, location_id, entity_type, entity_id,
                    revenue_account_id, expense_account_id, liability_account_id,
                    asset_account_id, contra_revenue_account_id, memo`,
    );
    const mapping = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return { result: mapping, events: [] };
  });

  await auditLog(ctx, 'fnb.gl_mapping.configured', 'gl_mapping', (result as Record<string, unknown>).id as string);
  return result;
}
