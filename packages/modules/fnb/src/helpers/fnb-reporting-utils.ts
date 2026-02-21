/**
 * F&B Reporting Utilities
 *
 * Pure helper functions for F&B read model projections.
 */

// ── Daypart Mapping ───────────────────────────────────────────────

export const DAYPART_RANGES = {
  breakfast: { start: 5, end: 11 },  // 5:00 AM – 10:59 AM
  lunch:     { start: 11, end: 16 }, // 11:00 AM – 3:59 PM
  dinner:    { start: 16, end: 22 }, // 4:00 PM – 9:59 PM
  late_night: { start: 22, end: 5 }, // 10:00 PM – 4:59 AM
} as const;

export type Daypart = 'breakfast' | 'lunch' | 'dinner' | 'late_night';

/**
 * Maps an hour (0-23) to a daypart.
 */
export function computeDaypart(hour: number): Daypart {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'late_night'; // 22-23 or 0-4
}

/**
 * Computes turn time in minutes between two ISO timestamps.
 * Returns null if either is missing.
 */
export function computeTurnTimeMinutes(
  openedAt: string | null,
  closedAt: string | null,
): number | null {
  if (!openedAt || !closedAt) return null;
  const diff = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (diff < 0) return null;
  return Math.round(diff / 60000);
}

/**
 * Computes a running average given the old average, old count, and new value.
 * Used for incremental average computation in upserts.
 */
export function incrementalAvg(
  oldAvg: number,
  oldCount: number,
  newValue: number,
): number {
  if (oldCount <= 0) return newValue;
  return oldAvg + (newValue - oldAvg) / (oldCount + 1);
}

/**
 * Computes tip percentage from tip total and sales total (both in dollars as numbers).
 */
export function computeTipPercentage(tipTotal: number, salesTotal: number): number | null {
  if (salesTotal <= 0) return null;
  return Number(((tipTotal / salesTotal) * 100).toFixed(2));
}

// ── Consumer Input Types ──────────────────────────────────────────

export interface FnbTabClosedConsumerData {
  tabId: string;
  locationId: string;
  businessDate: string;
  serverUserId: string;
  tableId: string | null;
  partySize: number;
  totalCents: number;
  tipCents: number;
  discountCents: number;
  compCents: number;
  openedAt: string;
  closedAt: string;
  hour: number;
  items: Array<{
    catalogItemId: string;
    catalogItemName: string;
    categoryName: string | null;
    departmentName: string | null;
    quantity: number;
    revenueCents: number;
  }>;
}

export interface FnbPaymentCompletedConsumerData {
  locationId: string;
  businessDate: string;
  serverUserId: string;
  totalCents: number;
  discountCents: number;
  discountType: string | null;
  compCents: number;
  compReason: string | null;
  voidCount: number;
  voidReason: string | null;
}

export interface FnbTicketBumpedConsumerData {
  ticketId: string;
  locationId: string;
  stationId: string;
  businessDate: string;
  ticketTimeSeconds: number;
  itemCount: number;
  thresholdSeconds: number;
  hour: number;
}

export interface FnbItemBumpedConsumerData {
  locationId: string;
  stationId: string;
  businessDate: string;
}

export interface FnbItemVoidedConsumerData {
  locationId: string;
  stationId: string;
  businessDate: string;
}
