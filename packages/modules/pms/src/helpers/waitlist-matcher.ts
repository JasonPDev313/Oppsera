// ══════════════════════════════════════════════════════════════════
// PMS Waitlist Matcher — Canceled Reservation → Waiting List Scoring
// ══════════════════════════════════════════════════════════════════
//
// Pure business logic helper for matching canceled reservations
// to waiting list entries. No database access — the DB query layer
// passes data in, this engine scores and ranks it.
//
// Scoring system (100-point scale):
//   Room type match:   25%  — does the entry want this room type?
//   Date overlap:      30%  — how well do the date ranges align?
//   Occupancy fit:     15%  — does the room fit guest count?
//   Flexibility bonus: 10%  — more flexible entries rank slightly higher
//   Priority boost:    20%  — VIP, loyalty tier, deposit holders
// ══════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────

export interface CanceledReservation {
  roomTypeId: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  propertyId: string;
  maxOccupancy: number;
  nightlyRateCents: number;
}

export interface WaitlistEntry {
  id: string;
  guestId: string | null;
  guestName: string | null;
  roomTypeId: string | null;
  adults: number;
  children: number;
  checkInDate: string | null; // YYYY-MM-DD
  checkOutDate: string | null; // YYYY-MM-DD
  flexibility: string; // exact_dates | flexible_1_day | flexible_3_days | flexible_week | any_dates
  priority: number; // 0-10
  loyaltyTier: string | null;
  hasDeposit: boolean;
  createdAt: Date;
}

export interface WaitlistMatch {
  entryId: string;
  guestId: string | null;
  guestName: string | null;
  score: number; // 0-100, higher = better
  factors: MatchFactor[];
}

export interface MatchFactor {
  name: string;
  weight: number;
  score: number; // 0-1
  detail: string;
}

// ── Constants ────────────────────────────────────────────────────

const WEIGHT_ROOM_TYPE = 0.25;
const WEIGHT_DATE_OVERLAP = 0.30;
const WEIGHT_OCCUPANCY = 0.15;
const WEIGHT_FLEXIBILITY = 0.10;
const WEIGHT_PRIORITY = 0.20;

/** Entries below this score are filtered out */
const MIN_MATCH_SCORE = 10;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Flexibility mode → max allowed day offset for date matching */
const FLEXIBILITY_DAYS: Record<string, number> = {
  exact_dates: 0,
  flexible_1_day: 1,
  flexible_3_days: 3,
  flexible_week: 7,
  any_dates: 365,
};

// ── Scoring Functions ────────────────────────────────────────────

/**
 * Scores a single waitlist entry against a canceled reservation.
 */
export function scoreWaitlistEntry(
  entry: WaitlistEntry,
  slot: CanceledReservation,
  maxPriority: number,
): WaitlistMatch {
  const factors: MatchFactor[] = [];

  factors.push(scoreRoomTypeMatch(entry, slot));
  factors.push(scoreDateOverlap(entry, slot));
  factors.push(scoreOccupancyFit(entry, slot));
  factors.push(scoreFlexibility(entry));
  factors.push(scorePriority(entry, maxPriority));

  const rawScore = factors.reduce((sum, f) => sum + f.weight * f.score, 0);
  const score = Math.round(rawScore * 100);

  return {
    entryId: entry.id,
    guestId: entry.guestId,
    guestName: entry.guestName,
    score,
    factors,
  };
}

/**
 * Matches all waitlist entries against a canceled reservation.
 * Scores every entry, filters poor matches, returns sorted by score DESC.
 */
export function matchWaitlistEntries(
  entries: WaitlistEntry[],
  slot: CanceledReservation,
): WaitlistMatch[] {
  if (entries.length === 0) return [];

  const maxPriority = Math.max(...entries.map((e) => e.priority), 1);

  return entries
    .map((entry) => scoreWaitlistEntry(entry, slot, maxPriority))
    .filter((match) => match.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);
}

/**
 * Returns a human-readable summary of a waitlist match.
 */
export function formatMatchSummary(match: WaitlistMatch): string {
  const label = getMatchLabel(match.score);
  const topFactors = match.factors
    .filter((f) => f.score > 0)
    .sort((a, b) => b.weight * b.score - a.weight * a.score)
    .slice(0, 3)
    .map((f) => f.detail);

  const factorSummary = topFactors.length > 0 ? topFactors.join(', ') : 'no strong factors';
  return `${label} (${match.score}/100): ${factorSummary}`;
}

// ── Internal Scoring Helpers ─────────────────────────────────────

function scoreRoomTypeMatch(entry: WaitlistEntry, slot: CanceledReservation): MatchFactor {
  let score: number;
  let detail: string;

  if (entry.roomTypeId === null) {
    score = 1.0;
    detail = 'any room type accepted';
  } else if (entry.roomTypeId === slot.roomTypeId) {
    score = 1.0;
    detail = 'room type match';
  } else {
    score = 0.0;
    detail = 'room type mismatch';
  }

  return { name: 'room_type_match', weight: WEIGHT_ROOM_TYPE, score, detail };
}

function scoreDateOverlap(entry: WaitlistEntry, slot: CanceledReservation): MatchFactor {
  // No date preference = fully flexible
  if (entry.checkInDate === null || entry.checkOutDate === null || entry.flexibility === 'any_dates') {
    return { name: 'date_overlap', weight: WEIGHT_DATE_OVERLAP, score: 1.0, detail: 'dates flexible' };
  }

  const flexDays = FLEXIBILITY_DAYS[entry.flexibility] ?? 3;

  const entryCheckIn = parseDateYYYYMMDD(entry.checkInDate);
  const entryCheckOut = parseDateYYYYMMDD(entry.checkOutDate);
  const slotCheckIn = parseDateYYYYMMDD(slot.checkInDate);
  const slotCheckOut = parseDateYYYYMMDD(slot.checkOutDate);

  // Check if the slot dates fall within the entry's flexible window
  const checkInDiff = Math.abs(slotCheckIn.getTime() - entryCheckIn.getTime()) / ONE_DAY_MS;
  const checkOutDiff = Math.abs(slotCheckOut.getTime() - entryCheckOut.getTime()) / ONE_DAY_MS;

  // Perfect match
  if (checkInDiff === 0 && checkOutDiff === 0) {
    return { name: 'date_overlap', weight: WEIGHT_DATE_OVERLAP, score: 1.0, detail: 'exact date match' };
  }

  // Within flexibility window
  if (checkInDiff <= flexDays && checkOutDiff <= flexDays) {
    // Score based on how close the dates are (closer = higher)
    const avgDiff = (checkInDiff + checkOutDiff) / 2;
    const score = Math.max(0, 1.0 - (avgDiff / (flexDays + 1)) * 0.5);
    return { name: 'date_overlap', weight: WEIGHT_DATE_OVERLAP, score, detail: `within ${Math.ceil(Math.max(checkInDiff, checkOutDiff))} day(s)` };
  }

  // Check for partial overlap (slot overlaps with desired dates)
  const overlapStart = Math.max(slotCheckIn.getTime(), entryCheckIn.getTime());
  const overlapEnd = Math.min(slotCheckOut.getTime(), entryCheckOut.getTime());
  const overlapDays = (overlapEnd - overlapStart) / ONE_DAY_MS;

  if (overlapDays > 0) {
    const entryNights = (entryCheckOut.getTime() - entryCheckIn.getTime()) / ONE_DAY_MS;
    const overlapRatio = overlapDays / entryNights;
    const score = Math.max(0.1, overlapRatio * 0.4);
    return { name: 'date_overlap', weight: WEIGHT_DATE_OVERLAP, score, detail: `${Math.round(overlapDays)} night(s) overlap` };
  }

  return { name: 'date_overlap', weight: WEIGHT_DATE_OVERLAP, score: 0.0, detail: 'no date overlap' };
}

function scoreOccupancyFit(entry: WaitlistEntry, slot: CanceledReservation): MatchFactor {
  const totalGuests = entry.adults + entry.children;

  if (totalGuests <= slot.maxOccupancy) {
    return { name: 'occupancy_fit', weight: WEIGHT_OCCUPANCY, score: 1.0, detail: 'fits room capacity' };
  }

  // Slightly over — might still work with rollaway/crib
  if (totalGuests <= slot.maxOccupancy + 1) {
    return { name: 'occupancy_fit', weight: WEIGHT_OCCUPANCY, score: 0.5, detail: 'near capacity limit' };
  }

  return { name: 'occupancy_fit', weight: WEIGHT_OCCUPANCY, score: 0.0, detail: 'exceeds capacity' };
}

function scoreFlexibility(entry: WaitlistEntry): MatchFactor {
  const flexScores: Record<string, number> = {
    any_dates: 1.0,
    flexible_week: 0.8,
    flexible_3_days: 0.6,
    flexible_1_day: 0.4,
    exact_dates: 0.2,
  };

  const score = flexScores[entry.flexibility] ?? 0.5;
  return { name: 'flexibility_bonus', weight: WEIGHT_FLEXIBILITY, score, detail: entry.flexibility.replace(/_/g, ' ') };
}

function scorePriority(entry: WaitlistEntry, maxPriority: number): MatchFactor {
  // Base priority from numeric score
  let score = maxPriority > 0 ? entry.priority / maxPriority : 0;

  // Boost for deposit holders (+0.2)
  if (entry.hasDeposit) score = Math.min(score + 0.2, 1.0);

  // Boost for loyalty members (+0.15)
  if (entry.loyaltyTier) score = Math.min(score + 0.15, 1.0);

  score = Math.min(score, 1.0);

  let detail: string;
  if (score >= 0.8) detail = 'high priority';
  else if (score >= 0.5) detail = 'medium priority';
  else detail = 'standard priority';

  if (entry.hasDeposit) detail += ' + deposit';
  if (entry.loyaltyTier) detail += ` + ${entry.loyaltyTier}`;

  return { name: 'priority_boost', weight: WEIGHT_PRIORITY, score, detail };
}

// ── Date Utilities ───────────────────────────────────────────────

function parseDateYYYYMMDD(dateStr: string): Date {
  const [y = 0, m = 0, d = 0] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMatchLabel(score: number): string {
  if (score >= 80) return 'Strong match';
  if (score >= 60) return 'Good match';
  if (score >= 40) return 'Fair match';
  if (score >= 20) return 'Weak match';
  return 'Poor match';
}
