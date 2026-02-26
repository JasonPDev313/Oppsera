/**
 * HOST V2: Wait-time estimation engine.
 *
 * Pure algorithm functions for computing wait-time quotes.
 * DB queries are separate — the algorithm works on pre-fetched data.
 */

// ── Types ───────────────────────────────────────────────────────

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low' | 'default';
  factors: {
    avgTurnTimeMinutes: number;
    occupancyPercent: number;
    tablesAvailableSoon: number;
    upcomingReservationClaims: number;
    dataPointCount: number;
  };
}

export interface EstimateWaitTimeInput {
  tenantId: string;
  locationId: string;
  partySize: number;
  mealPeriod: string;
  requestedAt?: Date;
}

export interface TurnTimeData {
  avgTurnTimeMinutes: number;
  dataPointCount: number;
}

export interface OccupancyData {
  totalTables: number;
  occupiedTables: number;
  tablesAboutToTurn: number;
}

// ── Constants ───────────────────────────────────────────────────

export const DEFAULT_TURN_TIMES: Record<string, number> = {
  small: 45,
  medium: 60,
  large: 75,
  xlarge: 90,
};

const MIN_DATA_POINTS = 10;
const MIN_WAIT_MINUTES = 5;
const MAX_WAIT_MINUTES = 120;
const ROUND_TO_MINUTES = 5;

// ── Pure Algorithm Functions ────────────────────────────────────

export function getPartySizeBucket(partySize: number): string {
  if (partySize <= 2) return 'small';
  if (partySize <= 4) return 'medium';
  if (partySize <= 6) return 'large';
  return 'xlarge';
}

export function getConfidence(dataPointCount: number): WaitTimeEstimate['confidence'] {
  if (dataPointCount >= 50) return 'high';
  if (dataPointCount >= 20) return 'medium';
  if (dataPointCount >= MIN_DATA_POINTS) return 'low';
  return 'default';
}

export function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Core wait-time estimation algorithm.
 * Takes pre-fetched data and computes the estimate.
 */
export function computeWaitTime(
  turnTime: TurnTimeData,
  occupancy: OccupancyData,
  upcomingReservationClaims: number,
  partySize: number,
): WaitTimeEstimate {
  const bucket = getPartySizeBucket(partySize);

  // Resolve avg turn time — use historical data or defaults
  const avgTurnTime = turnTime.dataPointCount >= MIN_DATA_POINTS
    ? turnTime.avgTurnTimeMinutes
    : DEFAULT_TURN_TIMES[bucket] ?? 60;

  const dataPointCount = turnTime.dataPointCount;
  const confidence = getConfidence(dataPointCount);

  // Occupancy
  const occupancyPercent = occupancy.totalTables > 0
    ? (occupancy.occupiedTables / occupancy.totalTables) * 100
    : 0;

  // No tables at this location — can't estimate, return 0
  if (occupancy.totalTables === 0) {
    return {
      estimatedMinutes: 0,
      confidence,
      factors: {
        avgTurnTimeMinutes: avgTurnTime,
        occupancyPercent: 0,
        tablesAvailableSoon: 0,
        upcomingReservationClaims,
        dataPointCount,
      },
    };
  }

  // Net available tables
  const availableTables = occupancy.totalTables - occupancy.occupiedTables;
  const effectiveAvailable = availableTables + occupancy.tablesAboutToTurn;
  const netAvailable = effectiveAvailable - upcomingReservationClaims;

  let estimatedMinutes: number;

  if (netAvailable > 0) {
    // Table available now or very soon
    estimatedMinutes = 0;
  } else {
    const turnsNeeded = Math.abs(netAvailable) + 1;
    const divisor = Math.max(occupancy.tablesAboutToTurn, 1);
    estimatedMinutes = avgTurnTime * (turnsNeeded / divisor);
  }

  // Round to nearest 5 minutes
  estimatedMinutes = roundToNearest(estimatedMinutes, ROUND_TO_MINUTES);

  // Clamp — if 0, keep it at 0 (table available now)
  if (estimatedMinutes > 0) {
    estimatedMinutes = clamp(estimatedMinutes, MIN_WAIT_MINUTES, MAX_WAIT_MINUTES);
  }

  return {
    estimatedMinutes,
    confidence,
    factors: {
      avgTurnTimeMinutes: avgTurnTime,
      occupancyPercent: Math.round(occupancyPercent * 10) / 10,
      tablesAvailableSoon: occupancy.tablesAboutToTurn,
      upcomingReservationClaims,
      dataPointCount,
    },
  };
}
