import { eq, and, asc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fixedAssets, fixedAssetDepreciation } from '@oppsera/db';

export interface DepreciationHistoryItem {
  id: string;
  periodDate: string;
  depreciationAmount: number;
  accumulatedTotal: number;
  netBookValue: number;
  glJournalEntryId: string | null;
  createdAt: string;
}

export interface FixedAssetDetail {
  id: string;
  assetNumber: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  assetGlAccountId: string | null;
  depreciationExpenseAccountId: string | null;
  accumulatedDepreciationAccountId: string | null;
  disposalDate: string | null;
  disposalProceeds: number | null;
  disposalGlAccountId: string | null;
  locationId: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  depreciationHistory: DepreciationHistoryItem[];
  netBookValue: number;
  accumulatedDepreciation: number;
  monthlyDepreciation: number;
}

interface GetFixedAssetInput {
  tenantId: string;
  assetId: string;
}

/**
 * Calculate the monthly depreciation amount based on the asset's method.
 * Returns the current-period amount (may vary for declining_balance and sum_of_years).
 */
function calculateMonthlyDepreciation(
  method: string,
  acquisitionCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
  accumulatedDepreciation: number,
): number {
  const depreciableBase = acquisitionCost - salvageValue;
  const currentNBV = acquisitionCost - accumulatedDepreciation;

  if (depreciableBase <= 0 || usefulLifeMonths <= 0) return 0;
  if (currentNBV <= salvageValue) return 0;

  switch (method) {
    case 'straight_line': {
      return Math.round((depreciableBase / usefulLifeMonths) * 100) / 100;
    }

    case 'declining_balance': {
      // Double-declining balance
      const rate = 2 / usefulLifeMonths;
      const raw = currentNBV * rate;
      // Cannot depreciate below salvage value
      const maxAllowed = currentNBV - salvageValue;
      return Math.round(Math.min(raw, maxAllowed) * 100) / 100;
    }

    case 'sum_of_years': {
      // Determine how many months have elapsed
      const monthsElapsed = Math.round(
        (accumulatedDepreciation / depreciableBase) * usefulLifeMonths,
      ) || 0;
      const remainingMonths = Math.max(usefulLifeMonths - monthsElapsed, 0);
      if (remainingMonths === 0) return 0;
      // Sum of digits for total useful life in months
      const sumDigits = (usefulLifeMonths * (usefulLifeMonths + 1)) / 2;
      const monthlyAmount = (remainingMonths / sumDigits) * depreciableBase;
      return Math.round(monthlyAmount * 100) / 100;
    }

    default:
      // units_of_production or unknown — fall back to straight-line equivalent
      return Math.round((depreciableBase / usefulLifeMonths) * 100) / 100;
  }
}

export async function getFixedAsset(
  input: GetFixedAssetInput,
): Promise<FixedAssetDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [asset] = await tx
      .select()
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.id, input.assetId),
          eq(fixedAssets.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!asset) return null;

    const depreciationRows = await tx
      .select()
      .from(fixedAssetDepreciation)
      .where(
        and(
          eq(fixedAssetDepreciation.assetId, input.assetId),
          eq(fixedAssetDepreciation.tenantId, input.tenantId),
        ),
      )
      .orderBy(asc(fixedAssetDepreciation.periodDate));

    const depreciationHistory: DepreciationHistoryItem[] = depreciationRows.map(
      (row) => ({
        id: row.id,
        periodDate: String(row.periodDate),
        depreciationAmount: Number(row.depreciationAmount),
        accumulatedTotal: Number(row.accumulatedTotal),
        netBookValue: Number(row.netBookValue),
        glJournalEntryId: row.glJournalEntryId ?? null,
        createdAt: String(row.createdAt),
      }),
    );

    const acquisitionCost = Number(asset.acquisitionCost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLifeMonths = asset.usefulLifeMonths;

    // Accumulated depreciation from the latest record, or 0 if none
    const accumulatedDepreciation =
      depreciationHistory.length > 0
        ? depreciationHistory[depreciationHistory.length - 1]!.accumulatedTotal
        : 0;

    const netBookValue = Math.round((acquisitionCost - accumulatedDepreciation) * 100) / 100;

    const monthlyDepreciation = calculateMonthlyDepreciation(
      asset.depreciationMethod,
      acquisitionCost,
      salvageValue,
      usefulLifeMonths,
      accumulatedDepreciation,
    );

    return {
      id: asset.id,
      assetNumber: asset.assetNumber,
      name: asset.name,
      description: asset.description ?? null,
      category: asset.category,
      status: asset.status,
      acquisitionDate: String(asset.acquisitionDate),
      acquisitionCost,
      salvageValue,
      usefulLifeMonths,
      depreciationMethod: asset.depreciationMethod,
      assetGlAccountId: asset.assetGlAccountId ?? null,
      depreciationExpenseAccountId: asset.depreciationExpenseAccountId ?? null,
      accumulatedDepreciationAccountId: asset.accumulatedDepreciationAccountId ?? null,
      disposalDate: asset.disposalDate ? String(asset.disposalDate) : null,
      disposalProceeds: asset.disposalProceeds ? Number(asset.disposalProceeds) : null,
      disposalGlAccountId: asset.disposalGlAccountId ?? null,
      locationId: asset.locationId ?? null,
      notes: asset.notes ?? null,
      metadata: (asset.metadata as Record<string, unknown>) ?? {},
      createdBy: asset.createdBy ?? null,
      createdAt: String(asset.createdAt),
      updatedAt: String(asset.updatedAt),
      depreciationHistory,
      netBookValue,
      accumulatedDepreciation,
      monthlyDepreciation,
    };
  });
}
