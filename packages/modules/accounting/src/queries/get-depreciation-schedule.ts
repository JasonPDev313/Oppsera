import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fixedAssets, fixedAssetDepreciation } from '@oppsera/db';

export interface DepreciationScheduleItem {
  periodDate: string; // YYYY-MM-DD
  depreciationAmount: number;
  accumulatedTotal: number;
  netBookValue: number;
  isRecorded: boolean;
}

export interface DepreciationSchedule {
  assetId: string;
  assetName: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  schedule: DepreciationScheduleItem[];
}

interface GetDepreciationScheduleInput {
  tenantId: string;
  assetId: string;
}

/**
 * Advance a YYYY-MM-DD date string by one month, clamping to the last day
 * of the target month when necessary (e.g., 2026-01-31 -> 2026-02-28).
 */
function addMonth(dateStr: string): string {
  const [yearStr = '2026', monthStr = '01', dayStr = '01'] = dateStr.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr);
  const day = Number(dayStr);

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  // Clamp day to last day of target month
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export async function getDepreciationSchedule(
  input: GetDepreciationScheduleInput,
): Promise<DepreciationSchedule | null> {
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

    // Fetch existing depreciation records
    const existingRows = await tx
      .select()
      .from(fixedAssetDepreciation)
      .where(
        and(
          eq(fixedAssetDepreciation.assetId, input.assetId),
          eq(fixedAssetDepreciation.tenantId, input.tenantId),
        ),
      )
      .orderBy(asc(fixedAssetDepreciation.periodDate));

    const acquisitionCost = Number(asset.acquisitionCost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLifeMonths = asset.usefulLifeMonths;
    const depreciableBase = acquisitionCost - salvageValue;

    // Build a lookup set of already-recorded periods
    const recordedPeriods = new Map<string, { amount: number; accumulated: number; nbv: number }>();
    for (const row of existingRows) {
      recordedPeriods.set(String(row.periodDate), {
        amount: Number(row.depreciationAmount),
        accumulated: Number(row.accumulatedTotal),
        nbv: Number(row.netBookValue),
      });
    }

    // Generate the full schedule month by month
    const schedule: DepreciationScheduleItem[] = [];
    let currentDate = String(asset.acquisitionDate);
    let runningAccumulated = 0;

    // Sum of digits for sum_of_years method
    const sumDigits = (usefulLifeMonths * (usefulLifeMonths + 1)) / 2;

    for (let month = 1; month <= usefulLifeMonths; month++) {
      // Period date is the first day of the next month after acquisition
      // (depreciation starts the month after acquisition)
      currentDate = addMonth(currentDate);

      const recorded = recordedPeriods.get(currentDate);
      if (recorded) {
        // Use actual recorded values
        schedule.push({
          periodDate: currentDate,
          depreciationAmount: recorded.amount,
          accumulatedTotal: recorded.accumulated,
          netBookValue: recorded.nbv,
          isRecorded: true,
        });
        runningAccumulated = recorded.accumulated;
        continue;
      }

      // Project future depreciation based on method
      let depreciationAmount = 0;
      const currentNBV = acquisitionCost - runningAccumulated;

      if (depreciableBase <= 0 || currentNBV <= salvageValue) {
        depreciationAmount = 0;
      } else {
        switch (asset.depreciationMethod) {
          case 'straight_line': {
            depreciationAmount = depreciableBase / usefulLifeMonths;
            break;
          }

          case 'declining_balance': {
            // Double-declining balance
            const rate = 2 / usefulLifeMonths;
            const raw = currentNBV * rate;
            const maxAllowed = currentNBV - salvageValue;
            depreciationAmount = Math.min(raw, maxAllowed);
            break;
          }

          case 'sum_of_years': {
            const remainingMonths = usefulLifeMonths - month + 1;
            depreciationAmount = (remainingMonths / sumDigits) * depreciableBase;
            break;
          }

          default: {
            // Fallback to straight-line
            depreciationAmount = depreciableBase / usefulLifeMonths;
            break;
          }
        }
      }

      // Ensure we don't depreciate below salvage value
      depreciationAmount = Math.max(depreciationAmount, 0);
      const maxRemaining = currentNBV - salvageValue;
      if (depreciationAmount > maxRemaining) {
        depreciationAmount = Math.max(maxRemaining, 0);
      }

      depreciationAmount = Math.round(depreciationAmount * 100) / 100;
      runningAccumulated = Math.round((runningAccumulated + depreciationAmount) * 100) / 100;
      const netBookValue = Math.round((acquisitionCost - runningAccumulated) * 100) / 100;

      schedule.push({
        periodDate: currentDate,
        depreciationAmount,
        accumulatedTotal: runningAccumulated,
        netBookValue,
        isRecorded: false,
      });
    }

    return {
      assetId: asset.id,
      assetName: asset.name,
      acquisitionCost,
      salvageValue,
      usefulLifeMonths,
      depreciationMethod: asset.depreciationMethod,
      schedule,
    };
  });
}
