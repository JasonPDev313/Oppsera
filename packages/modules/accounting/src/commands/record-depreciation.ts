import { eq, and, desc, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { fixedAssets, fixedAssetDepreciation } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface RecordDepreciationInput {
  assetId: string;
  periodDate: string;
}

/**
 * Calculate and record a single period's depreciation for a fixed asset.
 *
 * Depreciation methods:
 * - straight_line:      (cost - salvage) / usefulLifeMonths
 * - declining_balance:  2 * (1/usefulLifeMonths) * currentNetBookValue  (double declining)
 * - sum_of_years:       (remainingMonths / sumOfYearsDigits) * (cost - salvage)
 *
 * GL posting: Dr Depreciation Expense / Cr Accumulated Depreciation
 *
 * Idempotency is enforced by the UNIQUE index on (tenantId, assetId, periodDate).
 */
export async function recordDepreciation(ctx: RequestContext, input: RecordDepreciationInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch the asset
    const [asset] = await tx
      .select()
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.id, input.assetId),
          eq(fixedAssets.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!asset) {
      throw new Error('Fixed asset not found');
    }

    if (asset.status !== 'active') {
      throw new Error(`Cannot depreciate asset with status "${asset.status}". Only active assets can be depreciated.`);
    }

    // Check for existing depreciation record (idempotency guard)
    const [existingRecord] = await tx
      .select({ id: fixedAssetDepreciation.id })
      .from(fixedAssetDepreciation)
      .where(
        and(
          eq(fixedAssetDepreciation.tenantId, ctx.tenantId),
          eq(fixedAssetDepreciation.assetId, input.assetId),
          eq(fixedAssetDepreciation.periodDate, input.periodDate),
        ),
      )
      .limit(1);

    if (existingRecord) {
      // Already recorded for this period — skip silently (idempotent)
      return { result: existingRecord, events: [] };
    }

    // Get the most recent depreciation record to determine accumulated total
    const [lastRecord] = await tx
      .select({
        accumulatedTotal: fixedAssetDepreciation.accumulatedTotal,
        netBookValue: fixedAssetDepreciation.netBookValue,
      })
      .from(fixedAssetDepreciation)
      .where(
        and(
          eq(fixedAssetDepreciation.tenantId, ctx.tenantId),
          eq(fixedAssetDepreciation.assetId, input.assetId),
        ),
      )
      .orderBy(desc(fixedAssetDepreciation.periodDate))
      .limit(1);

    const cost = Number(asset.acquisitionCost);
    const salvage = Number(asset.salvageValue);
    const usefulLife = asset.usefulLifeMonths;
    const previousAccumulated = lastRecord ? Number(lastRecord.accumulatedTotal) : 0;
    const currentNbv = lastRecord ? Number(lastRecord.netBookValue) : cost;

    // Count periods already recorded to determine remaining life
    const [periodCountResult] = await tx
      .select({
        count: sql<string>`COUNT(*)`,
      })
      .from(fixedAssetDepreciation)
      .where(
        and(
          eq(fixedAssetDepreciation.tenantId, ctx.tenantId),
          eq(fixedAssetDepreciation.assetId, input.assetId),
        ),
      );
    const periodsElapsed = Number(periodCountResult?.count ?? 0);
    const remainingMonths = Math.max(usefulLife - periodsElapsed, 0);

    if (remainingMonths <= 0) {
      throw new Error('Asset has exhausted its useful life. No further depreciation can be recorded.');
    }

    // Calculate depreciation amount based on method
    let rawDepreciation: number;

    switch (asset.depreciationMethod) {
      case 'straight_line': {
        rawDepreciation = (cost - salvage) / usefulLife;
        break;
      }
      case 'declining_balance': {
        // Double declining balance: rate = 2 / usefulLife, applied to current NBV
        const rate = 2 / usefulLife;
        rawDepreciation = rate * currentNbv;
        break;
      }
      case 'sum_of_years': {
        // Sum of years digits = n*(n+1)/2 where n = usefulLifeMonths
        const sumOfDigits = (usefulLife * (usefulLife + 1)) / 2;
        rawDepreciation = (remainingMonths / sumOfDigits) * (cost - salvage);
        break;
      }
      default: {
        throw new Error(`Unsupported depreciation method: ${asset.depreciationMethod}`);
      }
    }

    // Ensure depreciation does not reduce NBV below salvage value
    const maxDepreciation = currentNbv - salvage;
    const depreciationAmount = Math.max(0, Math.min(rawDepreciation, maxDepreciation));

    // Round to 2 decimal places
    const depreciationRounded = Number(depreciationAmount.toFixed(2));

    if (depreciationRounded <= 0) {
      throw new Error('Calculated depreciation is zero. Asset may already be fully depreciated.');
    }

    const newAccumulated = Number((previousAccumulated + depreciationRounded).toFixed(2));
    const newNbv = Number((cost - newAccumulated).toFixed(2));
    const depreciationStr = depreciationRounded.toFixed(2);
    const accumulatedStr = newAccumulated.toFixed(2);
    const nbvStr = newNbv.toFixed(2);

    // Validate GL accounts are configured
    if (!asset.depreciationExpenseAccountId || !asset.accumulatedDepreciationAccountId) {
      throw new Error(
        'Depreciation Expense and Accumulated Depreciation GL accounts must be configured on the asset before recording depreciation.',
      );
    }

    // Post GL journal entry: Dr Depreciation Expense / Cr Accumulated Depreciation
    const postingApi = getAccountingPostingApi();
    const journalResult = await postingApi.postEntry(ctx, {
      businessDate: input.periodDate,
      sourceModule: 'fixed_assets',
      sourceReferenceId: `depreciation-${input.assetId}-${input.periodDate}`,
      memo: `Depreciation - ${asset.name} (${asset.assetNumber}) - ${input.periodDate}`,
      lines: [
        {
          accountId: asset.depreciationExpenseAccountId,
          debitAmount: depreciationStr,
          creditAmount: '0',
          locationId: asset.locationId ?? undefined,
          memo: `Depreciation expense - ${asset.name}`,
        },
        {
          accountId: asset.accumulatedDepreciationAccountId,
          debitAmount: '0',
          creditAmount: depreciationStr,
          locationId: asset.locationId ?? undefined,
          memo: `Accumulated depreciation - ${asset.name}`,
        },
      ],
      forcePost: true,
    });

    // Insert depreciation record
    const id = generateUlid();
    const [record] = await tx
      .insert(fixedAssetDepreciation)
      .values({
        id,
        tenantId: ctx.tenantId,
        assetId: input.assetId,
        periodDate: input.periodDate,
        depreciationAmount: depreciationStr,
        accumulatedTotal: accumulatedStr,
        netBookValue: nbvStr,
        glJournalEntryId: journalResult.id,
      })
      .returning();

    // If NBV has reached salvage value, mark asset as fully depreciated
    const isFullyDepreciated = newNbv <= salvage;
    if (isFullyDepreciated) {
      await tx
        .update(fixedAssets)
        .set({ status: 'fully_depreciated', updatedAt: new Date() })
        .where(eq(fixedAssets.id, input.assetId));
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.FIXED_ASSET_DEPRECIATED, {
      assetId: input.assetId,
      assetNumber: asset.assetNumber,
      periodDate: input.periodDate,
      depreciationAmount: depreciationStr,
      accumulatedTotal: accumulatedStr,
      netBookValue: nbvStr,
      isFullyDepreciated,
      journalEntryId: journalResult.id,
    });

    return { result: record!, events: [event] };
  });

  await auditLog(ctx, 'accounting.fixed_asset.depreciated', 'fixed_asset', input.assetId);
  return result;
}
