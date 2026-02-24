import type { BusinessTier } from '@oppsera/shared';
import { TIER_THRESHOLDS } from '@oppsera/shared';

export interface TenantMetrics {
  annualRevenue: number;
  locationCount: number;
  userCount: number;
  glAccountCount: number;
}

/**
 * Pure function — no DB access.
 * Compares metrics against TIER_THRESHOLDS and returns the highest matching tier.
 */
export function classifyTenant(metrics: TenantMetrics): BusinessTier {
  const tiers: BusinessTier[] = ['ENTERPRISE', 'MID_MARKET', 'SMB'];
  for (const tier of tiers) {
    const t = TIER_THRESHOLDS[tier];
    if (
      metrics.annualRevenue >= t.annualRevenue ||
      metrics.locationCount >= t.locationCount ||
      metrics.userCount >= t.userCount ||
      metrics.glAccountCount >= t.glAccountCount
    ) {
      return tier;
    }
  }
  return 'SMB';
}
