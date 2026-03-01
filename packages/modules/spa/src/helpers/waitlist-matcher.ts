// ══════════════════════════════════════════════════════════════════
// Waitlist Matcher — Canceled Slot → Waiting List Scoring Engine
// ══════════════════════════════════════════════════════════════════
//
// Pure business logic helper for matching canceled appointment slots
// to waiting list entries. No database access — the DB query layer
// passes data in, this engine scores and ranks it.
//
// Scoring system (100-point scale):
//   Service match:   30%  — does the waitlist entry want this service?
//   Provider match:  25%  — does the entry prefer this provider?
//   Date match:      20%  — does the preferred date align with the slot?
//   Time match:      15%  — is the slot time within the preferred window?
//   Priority boost:  10%  — normalized priority among all entries
// ══════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────

export interface CanceledSlot {
  serviceId: string;
  providerId: string;
  startAt: Date;
  endAt: Date;
  locationId: string;
}

export interface WaitlistEntry {
  id: string;
  customerId: string | null;
  serviceId: string | null;
  preferredProviderId: string | null;
  preferredDate: string | null; // YYYY-MM-DD
  preferredTimeStart: string | null; // HH:MM
  preferredTimeEnd: string | null; // HH:MM
  flexibility: 'exact' | 'flexible_time' | 'flexible_date' | 'any';
  priority: number; // higher = higher priority
  createdAt: Date;
}

export interface WaitlistMatch {
  entryId: string;
  customerId: string | null;
  score: number; // 0-100, higher = better match
  factors: MatchFactor[];
}

export interface MatchFactor {
  name: string;
  weight: number;
  score: number; // 0-1
  detail: string;
}

// ── Constants ────────────────────────────────────────────────────

const WEIGHT_SERVICE = 0.30;
const WEIGHT_PROVIDER = 0.25;
const WEIGHT_DATE = 0.20;
const WEIGHT_TIME = 0.15;
const WEIGHT_PRIORITY = 0.10;

/** Minimum score threshold — entries below this are filtered out */
const MIN_MATCH_SCORE = 10;

/** Number of milliseconds in one hour */
const _ONE_HOUR_MS = 60 * 60 * 1000;

/** Number of milliseconds in one day */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ── Scoring Functions ────────────────────────────────────────────

/**
 * Scores a single waitlist entry against a canceled slot.
 *
 * Evaluates 5 factors (service, provider, date, time, priority),
 * each weighted, and returns a 0-100 composite score with detailed
 * factor breakdown.
 */
export function scoreWaitlistEntry(
  entry: WaitlistEntry,
  slot: CanceledSlot,
  maxPriority: number,
): WaitlistMatch {
  const factors: MatchFactor[] = [];

  // Factor 1: Service match (30%)
  const serviceFactor = scoreServiceMatch(entry, slot);
  factors.push(serviceFactor);

  // Factor 2: Provider match (25%)
  const providerFactor = scoreProviderMatch(entry, slot);
  factors.push(providerFactor);

  // Factor 3: Date match (20%)
  const dateFactor = scoreDateMatch(entry, slot);
  factors.push(dateFactor);

  // Factor 4: Time match (15%)
  const timeFactor = scoreTimeMatch(entry, slot);
  factors.push(timeFactor);

  // Factor 5: Priority boost (10%)
  const priorityFactor = scorePriority(entry, maxPriority);
  factors.push(priorityFactor);

  // Composite score: sum(weight * score) * 100
  const rawScore = factors.reduce(
    (sum, f) => sum + f.weight * f.score,
    0,
  );
  const score = Math.round(rawScore * 100);

  return {
    entryId: entry.id,
    customerId: entry.customerId,
    score,
    factors,
  };
}

/**
 * Matches all waitlist entries against a canceled slot.
 *
 * Scores every entry, filters out poor matches (score < 10),
 * and returns results sorted by score descending (best match first).
 */
export function matchWaitlistEntries(
  entries: WaitlistEntry[],
  slot: CanceledSlot,
): WaitlistMatch[] {
  if (entries.length === 0) return [];

  const maxPriority = Math.max(...entries.map((e) => e.priority), 1);

  const matches = entries
    .map((entry) => scoreWaitlistEntry(entry, slot, maxPriority))
    .filter((match) => match.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Checks whether a waitlist entry's flexibility mode is compatible
 * with the canceled slot.
 *
 * - `exact`:         service AND provider AND date AND time must all match
 * - `flexible_time`: service AND date must match (time is flexible)
 * - `flexible_date`: service must match (date and time are flexible)
 * - `any`:           always compatible
 */
export function isFlexibilityCompatible(
  entry: WaitlistEntry,
  slot: CanceledSlot,
): boolean {
  switch (entry.flexibility) {
    case 'any':
      return true;

    case 'flexible_date': {
      // Service must match (null = any service, passes)
      if (entry.serviceId !== null && entry.serviceId !== slot.serviceId) {
        return false;
      }
      return true;
    }

    case 'flexible_time': {
      // Service must match
      if (entry.serviceId !== null && entry.serviceId !== slot.serviceId) {
        return false;
      }
      // Date must match
      if (entry.preferredDate !== null) {
        const slotDate = formatDateYYYYMMDD(slot.startAt);
        if (entry.preferredDate !== slotDate) return false;
      }
      return true;
    }

    case 'exact': {
      // Service must match
      if (entry.serviceId !== null && entry.serviceId !== slot.serviceId) {
        return false;
      }
      // Provider must match
      if (entry.preferredProviderId !== null && entry.preferredProviderId !== slot.providerId) {
        return false;
      }
      // Date must match
      if (entry.preferredDate !== null) {
        const slotDate = formatDateYYYYMMDD(slot.startAt);
        if (entry.preferredDate !== slotDate) return false;
      }
      // Time must be within preferred window
      if (entry.preferredTimeStart !== null && entry.preferredTimeEnd !== null) {
        const slotMinutes = getMinutesOfDay(slot.startAt);
        const startMinutes = parseTimeToMinutes(entry.preferredTimeStart);
        const endMinutes = parseTimeToMinutes(entry.preferredTimeEnd);
        if (slotMinutes < startMinutes || slotMinutes > endMinutes) return false;
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * Returns a human-readable summary of a waitlist match.
 *
 * Format: "Strong match (85/100): service match, provider match, same day"
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

function scoreServiceMatch(entry: WaitlistEntry, slot: CanceledSlot): MatchFactor {
  let score: number;
  let detail: string;

  if (entry.serviceId === null) {
    // No preference — any service is fine
    score = 1.0;
    detail = 'any service accepted';
  } else if (entry.serviceId === slot.serviceId) {
    score = 1.0;
    detail = 'service match';
  } else {
    score = 0.0;
    detail = 'service mismatch';
  }

  return { name: 'service_match', weight: WEIGHT_SERVICE, score, detail };
}

function scoreProviderMatch(entry: WaitlistEntry, slot: CanceledSlot): MatchFactor {
  let score: number;
  let detail: string;

  if (entry.preferredProviderId === null) {
    // No preference — any provider is fine
    score = 1.0;
    detail = 'any provider accepted';
  } else if (entry.preferredProviderId === slot.providerId) {
    score = 1.0;
    detail = 'provider match';
  } else {
    score = 0.0;
    detail = 'provider mismatch';
  }

  return { name: 'provider_match', weight: WEIGHT_PROVIDER, score, detail };
}

function scoreDateMatch(entry: WaitlistEntry, slot: CanceledSlot): MatchFactor {
  let score: number;
  let detail: string;

  if (entry.preferredDate === null || entry.flexibility === 'flexible_date' || entry.flexibility === 'any') {
    // No specific date preference or flexibility allows any date
    score = 1.0;
    detail = 'date flexible';
  } else {
    const slotDate = formatDateYYYYMMDD(slot.startAt);

    if (entry.preferredDate === slotDate) {
      score = 1.0;
      detail = 'same day';
    } else {
      // Check if within 1 day
      const prefDateMs = parseDateYYYYMMDD(entry.preferredDate).getTime();
      const slotDateMs = startOfDay(slot.startAt).getTime();
      const diffDays = Math.abs(slotDateMs - prefDateMs) / ONE_DAY_MS;

      if (diffDays <= 1) {
        score = 0.5;
        detail = 'within 1 day';
      } else {
        score = 0.0;
        detail = 'date mismatch';
      }
    }
  }

  return { name: 'date_match', weight: WEIGHT_DATE, score, detail };
}

function scoreTimeMatch(entry: WaitlistEntry, slot: CanceledSlot): MatchFactor {
  let score: number;
  let detail: string;

  if (
    entry.preferredTimeStart === null ||
    entry.preferredTimeEnd === null ||
    entry.flexibility === 'any'
  ) {
    // No specific time preference
    score = 1.0;
    detail = 'time flexible';
  } else {
    const slotMinutes = getMinutesOfDay(slot.startAt);
    const startMinutes = parseTimeToMinutes(entry.preferredTimeStart);
    const endMinutes = parseTimeToMinutes(entry.preferredTimeEnd);

    if (slotMinutes >= startMinutes && slotMinutes <= endMinutes) {
      score = 1.0;
      detail = 'within preferred time';
    } else {
      // Check if within 1 hour of the preferred window
      const distanceToStart = Math.abs(slotMinutes - startMinutes);
      const distanceToEnd = Math.abs(slotMinutes - endMinutes);
      const minDistance = Math.min(distanceToStart, distanceToEnd);

      if (minDistance <= 60) {
        score = 0.5;
        detail = 'within 1 hour of preferred time';
      } else {
        score = 0.0;
        detail = 'outside preferred time';
      }
    }
  }

  return { name: 'time_match', weight: WEIGHT_TIME, score, detail };
}

function scorePriority(entry: WaitlistEntry, maxPriority: number): MatchFactor {
  // Normalize priority to 0-1 range
  // maxPriority guaranteed >= 1 (set in matchWaitlistEntries)
  const normalizedPriority = maxPriority > 0 ? entry.priority / maxPriority : 0;
  const score = Math.min(normalizedPriority, 1.0);

  let detail: string;
  if (score >= 0.8) {
    detail = 'high priority';
  } else if (score >= 0.5) {
    detail = 'medium priority';
  } else {
    detail = 'low priority';
  }

  return { name: 'priority_boost', weight: WEIGHT_PRIORITY, score, detail };
}

// ── Date/Time Utilities ──────────────────────────────────────────

/**
 * Formats a Date as YYYY-MM-DD using local date parts.
 */
function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a YYYY-MM-DD string into a Date at midnight local time.
 */
function parseDateYYYYMMDD(dateStr: string): Date {
  const [y = 0, m = 0, d = 0] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns the start of the day (midnight) for a given Date in local time.
 */
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Parses an HH:MM string into total minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns the total minutes since midnight for a Date (local time).
 */
function getMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Returns a human-readable label for a match score.
 */
function getMatchLabel(score: number): string {
  if (score >= 80) return 'Strong match';
  if (score >= 60) return 'Good match';
  if (score >= 40) return 'Fair match';
  if (score >= 20) return 'Weak match';
  return 'Poor match';
}
