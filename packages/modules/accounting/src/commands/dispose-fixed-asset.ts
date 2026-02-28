import { eq, and, desc } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { fixedAssets, fixedAssetDepreciation } from '@oppsera/db';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface DisposeFixedAssetInput {
  assetId: string;
  disposalDate: string;
  disposalProceeds: string;
  disposalGlAccountId?: string;
}

/**
 * Dispose of a fixed asset, removing it from the active register.
 *
 * GL posting (4 lines):
 *   Dr Cash/Disposal account   — disposal proceeds
 *   Dr Accumulated Depreciation — full accumulated depreciation to date
 *   Cr Asset account            — original acquisition cost
 *   Dr/Cr Gain/Loss on Disposal — difference (gain = credit, loss = debit)
 *
 * Gain/Loss = disposalProceeds - netBookValue
 *   Positive = gain (credit to disposal GL account)
 *   Negative = loss (debit to disposal GL account)
 */
export async function disposeFixedAsset(ctx: RequestContext, input: DisposeFixedAssetInput) {
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

    if (asset.status !== 'active' && asset.status !== 'fully_depreciated') {
      throw new Error(
        `Cannot dispose asset with status "${asset.status}". Only active or fully depreciated assets can be disposed.`,
      );
    }

    // Validate required GL accounts
    if (!asset.assetGlAccountId) {
      throw new Error('Asset GL account must be configured on the asset before disposal.');
    }
    if (!asset.accumulatedDepreciationAccountId) {
      throw new Error('Accumulated Depreciation GL account must be configured on the asset before disposal.');
    }

    const disposalAccountId = input.disposalGlAccountId ?? asset.disposalGlAccountId;
    if (!disposalAccountId) {
      throw new Error(
        'Disposal GL account must be provided or configured on the asset before disposal.',
      );
    }

    // Get the accumulated depreciation total
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
    const accumulatedDepreciation = lastRecord ? Number(lastRecord.accumulatedTotal) : 0;
    const netBookValue = lastRecord ? Number(lastRecord.netBookValue) : cost;
    const proceeds = Number(input.disposalProceeds);
    const gainLoss = Number((proceeds - netBookValue).toFixed(2));

    const costStr = cost.toFixed(2);
    const accumStr = accumulatedDepreciation.toFixed(2);
    const proceedsStr = proceeds.toFixed(2);
    const gainLossAbsStr = Math.abs(gainLoss).toFixed(2);

    // Build GL journal lines
    const lines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      locationId?: string;
      memo?: string;
    }> = [];

    // 1. Dr Cash/Disposal account — proceeds received
    if (proceeds > 0) {
      lines.push({
        accountId: disposalAccountId,
        debitAmount: proceedsStr,
        creditAmount: '0',
        locationId: asset.locationId ?? undefined,
        memo: `Disposal proceeds - ${asset.name}`,
      });
    }

    // 2. Dr Accumulated Depreciation — remove accumulated balance
    if (accumulatedDepreciation > 0) {
      lines.push({
        accountId: asset.accumulatedDepreciationAccountId,
        debitAmount: accumStr,
        creditAmount: '0',
        locationId: asset.locationId ?? undefined,
        memo: `Remove accumulated depreciation - ${asset.name}`,
      });
    }

    // 3. Cr Asset account — remove asset at original cost
    lines.push({
      accountId: asset.assetGlAccountId,
      debitAmount: '0',
      creditAmount: costStr,
      locationId: asset.locationId ?? undefined,
      memo: `Remove fixed asset - ${asset.name}`,
    });

    // 4. Gain or Loss on disposal
    if (gainLoss > 0) {
      // Gain: credit the disposal account
      lines.push({
        accountId: disposalAccountId,
        debitAmount: '0',
        creditAmount: gainLossAbsStr,
        locationId: asset.locationId ?? undefined,
        memo: `Gain on disposal - ${asset.name}`,
      });
    } else if (gainLoss < 0) {
      // Loss: debit the disposal account
      lines.push({
        accountId: disposalAccountId,
        debitAmount: gainLossAbsStr,
        creditAmount: '0',
        locationId: asset.locationId ?? undefined,
        memo: `Loss on disposal - ${asset.name}`,
      });
    }

    // Post GL journal entry
    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(ctx, {
      businessDate: input.disposalDate,
      sourceModule: 'fixed_assets',
      sourceReferenceId: `disposal-${input.assetId}`,
      memo: `Asset disposal - ${asset.name} (${asset.assetNumber})`,
      lines,
      forcePost: true,
    });

    // Update asset record
    const [updated] = await tx
      .update(fixedAssets)
      .set({
        status: 'disposed',
        disposalDate: input.disposalDate,
        disposalProceeds: input.disposalProceeds,
        disposalGlAccountId: disposalAccountId,
        updatedAt: new Date(),
      })
      .where(eq(fixedAssets.id, input.assetId))
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.FIXED_ASSET_DISPOSED, {
      assetId: input.assetId,
      assetNumber: asset.assetNumber,
      disposalDate: input.disposalDate,
      disposalProceeds: input.disposalProceeds,
      acquisitionCost: costStr,
      accumulatedDepreciation: accumStr,
      netBookValue: netBookValue.toFixed(2),
      gainLoss: gainLoss.toFixed(2),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.fixed_asset.disposed', 'fixed_asset', result.id);
  return result;
}
