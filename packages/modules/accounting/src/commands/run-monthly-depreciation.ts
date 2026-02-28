import { eq, and } from 'drizzle-orm';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { fixedAssets, withTenant } from '@oppsera/db';
import { recordDepreciation } from './record-depreciation';

export interface RunMonthlyDepreciationInput {
  periodDate: string;
}

export interface MonthlyDepreciationResult {
  processed: number;
  skipped: number;
  errors: string[];
}

/**
 * Batch command: run depreciation for ALL active fixed assets for a tenant.
 *
 * Iterates through all active assets and calls `recordDepreciation` for each.
 * Idempotency is handled per-asset by the unique index on (tenantId, assetId, periodDate)
 * inside `recordDepreciation` — duplicate periods are silently skipped.
 *
 * Errors are captured per-asset but do not stop processing of remaining assets.
 */
export async function runMonthlyDepreciation(
  ctx: RequestContext,
  input: RunMonthlyDepreciationInput,
): Promise<MonthlyDepreciationResult> {
  // Fetch all active assets for the tenant
  const activeAssets = await withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select({
        id: fixedAssets.id,
        assetNumber: fixedAssets.assetNumber,
        name: fixedAssets.name,
      })
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.tenantId, ctx.tenantId),
          eq(fixedAssets.status, 'active'),
        ),
      );
  });

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const asset of activeAssets) {
    try {
      await recordDepreciation(ctx, {
        assetId: asset.id,
        periodDate: input.periodDate,
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // If the depreciation was already recorded (idempotency), count as skipped
      if (message.includes('already') || message.includes('zero')) {
        skipped++;
      } else {
        errors.push(`${asset.assetNumber} (${asset.name}): ${message}`);
      }
    }
  }

  await auditLog(ctx, 'accounting.fixed_asset.monthly_depreciation', 'fixed_asset_batch', input.periodDate);

  return { processed, skipped, errors };
}
