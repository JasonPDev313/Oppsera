import type { BusinessTier } from './erp-tiers';

/** Default per-seat price in cents ($25.00/seat/month) */
export const DEFAULT_SEAT_PRICE_CENTS = 2500;

/** Maximum seats allowed per tier. null = unlimited. */
export const TIER_SEAT_LIMITS: Record<BusinessTier, number | null> = {
  SMB: 5,
  MID_MARKET: 25,
  ENTERPRISE: null,
};

/** Display names for tiers */
export const TIER_DISPLAY_NAMES: Record<BusinessTier, string> = {
  SMB: 'Starter',
  MID_MARKET: 'Professional',
  ENTERPRISE: 'Enterprise',
};

export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'canceled';

export type SubscriptionChangeType =
  | 'tier_upgrade'
  | 'tier_downgrade'
  | 'seat_change'
  | 'addon_change'
  | 'price_override'
  | 'subscription_created';

/** Ordered tiers for upgrade/downgrade detection */
const TIER_ORDER: Record<BusinessTier, number> = {
  SMB: 0,
  MID_MARKET: 1,
  ENTERPRISE: 2,
};

/** Determine if a tier change is an upgrade, downgrade, or lateral */
export function classifyTierChange(
  from: BusinessTier,
  to: BusinessTier,
): 'upgrade' | 'downgrade' | 'lateral' {
  const diff = TIER_ORDER[to] - TIER_ORDER[from];
  if (diff > 0) return 'upgrade';
  if (diff < 0) return 'downgrade';
  return 'lateral';
}

/** Compute monthly total: (seats * perSeatPrice) + baseFee + addonCost */
export function computeMonthlyTotal(
  seatCount: number,
  pricePerSeatCents: number,
  baseFeeCents: number,
  addonTotalCents: number,
): number {
  return seatCount * pricePerSeatCents + baseFeeCents + addonTotalCents;
}
