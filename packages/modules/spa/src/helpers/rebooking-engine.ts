// ══════════════════════════════════════════════════════════════════
// Spa Appointment Rebooking Engine — Pure Business Logic
// ══════════════════════════════════════════════════════════════════
//
// Pure functions for suggesting rebooking dates for spa appointments.
// No database access, no side effects — the DB query layer provides
// availability data; this engine scores and ranks suggestions.
//
// Date convention: all dates are YYYY-MM-DD strings, all times are
// HH:MM strings. Date arithmetic uses manual string parsing (no
// external date library dependency).
// ══════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────

export interface RebookingSuggestion {
  date: string; // YYYY-MM-DD
  timeSlots: RebookingTimeSlot[];
  score: number; // 0-100, higher = better match to customer preferences
  reason: string; // "Same day next week", "Next available with preferred provider", etc.
}

export interface RebookingTimeSlot {
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  providerId: string;
  providerName: string;
  available: boolean;
}

export interface RebookingPreferences {
  preferredProviderId?: string;
  preferredDayOfWeek?: number; // 0=Sun, 6=Sat
  preferredTimeStart?: string; // HH:MM
  preferredTimeEnd?: string; // HH:MM
  excludeDates?: string[]; // YYYY-MM-DD dates to skip
}

export interface AvailableDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  slots: Array<{
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    providerId: string;
    providerName: string;
  }>;
}

export interface RebookingInput {
  originalAppointmentDate: string; // YYYY-MM-DD
  originalDayOfWeek: number;
  originalTime: string; // HH:MM
  durationMinutes: number;
  availableDays: AvailableDay[];
  preferences: RebookingPreferences;
  rebookingWindowDays: number; // max days to look ahead (default 90)
  maxSuggestions?: number; // default 5
}

// ── Scoring Constants ────────────────────────────────────────────

/** Points awarded when the suggested day matches the original day of week */
const SCORE_SAME_DAY_OF_WEEK = 30;

/** Points awarded when the suggestion is within 7 days of the original */
const SCORE_WITHIN_FIRST_WEEK = 20;

/** Points deducted per day after the first week (from the WITHIN_FIRST_WEEK bonus) */
const SCORE_DECAY_PER_DAY_AFTER_WEEK = 3;

/** Points awarded when the preferred provider has availability on the day */
const SCORE_PREFERRED_PROVIDER = 25;

/** Points awarded when a slot falls within the preferred time window */
const SCORE_PREFERRED_TIME_WINDOW = 15;

/** Points awarded when a slot is within 1 hour of the original appointment time */
const SCORE_NEAR_ORIGINAL_TIME = 10;

/** Maximum total score (used for clamping) */
const SCORE_MAX = 100;

// ── Main Functions ───────────────────────────────────────────────

/**
 * Generate ranked rebooking suggestions from a set of available days.
 *
 * Scoring factors:
 *   - Same day of week as original appointment: +30
 *   - Within 7 days of original date: +20 (decreasing by 3/day after first week)
 *   - Preferred provider has availability: +25
 *   - Slot falls within preferred time window: +15
 *   - Slot is within 1 hour of original time: +10
 *
 * Excludes dates in preferences.excludeDates and dates beyond the
 * rebooking window. Returns at most maxSuggestions results (default 5),
 * sorted by score descending.
 */
export function generateRebookingSuggestions(
  input: RebookingInput,
): RebookingSuggestion[] {
  const {
    availableDays,
    preferences,
    rebookingWindowDays,
    originalAppointmentDate,
    maxSuggestions = 5,
  } = input;

  const excludeSet = new Set(preferences.excludeDates ?? []);

  // Calculate the cutoff date: originalDate + rebookingWindowDays
  const cutoffDate = addDays(originalAppointmentDate, rebookingWindowDays);

  const scored: RebookingSuggestion[] = [];

  for (const day of availableDays) {
    // Skip excluded dates
    if (excludeSet.has(day.date)) continue;

    // Skip dates beyond the rebooking window
    if (day.date > cutoffDate) continue;

    // Skip days with no slots
    if (day.slots.length === 0) continue;

    const score = scoreDayForRebooking(day, input);
    const _bestSlot = findBestTimeSlot(day, preferences, input.originalTime);
    const reason = formatSuggestionReason(day, input);

    // Build time slot list — mark the best slot as available, include all others
    const timeSlots: RebookingTimeSlot[] = day.slots.map((slot) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      providerId: slot.providerId,
      providerName: slot.providerName,
      available: true,
    }));

    scored.push({
      date: day.date,
      timeSlots,
      score,
      reason,
    });
  }

  // Sort by score descending, then by date ascending as tiebreaker
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.date.localeCompare(b.date);
  });

  return scored.slice(0, maxSuggestions);
}

/**
 * Calculate a score (0-100) for a specific available day based on how
 * well it matches the customer's rebooking preferences and original
 * appointment context.
 *
 * Factors:
 *   1. Day-of-week match with original appointment (+30)
 *   2. Proximity to original date (+20 within 7 days, decaying after)
 *   3. Preferred provider availability (+25)
 *   4. Time window preference match (+15)
 *   5. Proximity to original appointment time (+10)
 */
export function scoreDayForRebooking(
  day: AvailableDay,
  input: RebookingInput,
): number {
  const { originalAppointmentDate, originalDayOfWeek, originalTime, preferences } = input;

  let score = 0;

  // ── Factor 1: Day-of-week match ──────────────────────────────
  if (day.dayOfWeek === originalDayOfWeek) {
    score += SCORE_SAME_DAY_OF_WEEK;
  }

  // ── Factor 2: Proximity to original date ─────────────────────
  const daysBetween = getDaysBetween(originalAppointmentDate, day.date);

  if (daysBetween <= 7) {
    score += SCORE_WITHIN_FIRST_WEEK;
  } else {
    // Decay: start from the base bonus and subtract per extra day
    const daysAfterFirstWeek = daysBetween - 7;
    const proximityScore = Math.max(
      0,
      SCORE_WITHIN_FIRST_WEEK - daysAfterFirstWeek * SCORE_DECAY_PER_DAY_AFTER_WEEK,
    );
    score += proximityScore;
  }

  // ── Factor 3: Preferred provider availability ────────────────
  if (preferences.preferredProviderId) {
    const hasPreferredProvider = day.slots.some(
      (slot) => slot.providerId === preferences.preferredProviderId,
    );
    if (hasPreferredProvider) {
      score += SCORE_PREFERRED_PROVIDER;
    }
  }

  // ── Factor 4: Preferred time window match ────────────────────
  if (preferences.preferredTimeStart && preferences.preferredTimeEnd) {
    const prefStartMin = timeToMinutes(preferences.preferredTimeStart);
    const prefEndMin = timeToMinutes(preferences.preferredTimeEnd);

    const hasSlotInWindow = day.slots.some((slot) => {
      const slotStartMin = timeToMinutes(slot.startTime);
      return slotStartMin >= prefStartMin && slotStartMin <= prefEndMin;
    });

    if (hasSlotInWindow) {
      score += SCORE_PREFERRED_TIME_WINDOW;
    }
  }

  // ── Factor 5: Near original appointment time ─────────────────
  const originalMinutes = timeToMinutes(originalTime);
  const hasNearOriginalSlot = day.slots.some((slot) => {
    const slotMinutes = timeToMinutes(slot.startTime);
    return Math.abs(slotMinutes - originalMinutes) <= 60;
  });

  if (hasNearOriginalSlot) {
    score += SCORE_NEAR_ORIGINAL_TIME;
  }

  // Clamp to [0, 100]
  return Math.min(SCORE_MAX, Math.max(0, score));
}

/**
 * Find the best available time slot on a given day based on customer
 * preferences and the original appointment time.
 *
 * Priority:
 *   1. Preferred provider + preferred time window
 *   2. Preferred provider + any time
 *   3. Any provider + preferred time window
 *   4. Any provider + closest to original time
 *
 * Returns null if no suitable slot exists (empty slots array).
 */
export function findBestTimeSlot(
  day: AvailableDay,
  preferences: RebookingPreferences,
  originalTime: string,
): RebookingTimeSlot | null {
  if (day.slots.length === 0) return null;

  const { preferredProviderId, preferredTimeStart, preferredTimeEnd } = preferences;
  const originalMinutes = timeToMinutes(originalTime);

  const hasTimePreference = preferredTimeStart != null && preferredTimeEnd != null;
  const prefStartMin = hasTimePreference ? timeToMinutes(preferredTimeStart!) : 0;
  const prefEndMin = hasTimePreference ? timeToMinutes(preferredTimeEnd!) : 0;

  // Helper: check if a slot falls within the preferred time window
  const isInTimeWindow = (slot: { startTime: string }): boolean => {
    if (!hasTimePreference) return false;
    const slotMin = timeToMinutes(slot.startTime);
    return slotMin >= prefStartMin && slotMin <= prefEndMin;
  };

  // Helper: check if a slot is with the preferred provider
  const isPreferredProvider = (slot: { providerId: string }): boolean => {
    return preferredProviderId != null && slot.providerId === preferredProviderId;
  };

  // Helper: convert a raw slot to a RebookingTimeSlot
  const toTimeSlot = (slot: AvailableDay['slots'][number]): RebookingTimeSlot => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
    providerId: slot.providerId,
    providerName: slot.providerName,
    available: true,
  });

  // Priority 1: preferred provider + preferred time window
  if (preferredProviderId && hasTimePreference) {
    const match = day.slots.find(
      (s) => isPreferredProvider(s) && isInTimeWindow(s),
    );
    if (match) return toTimeSlot(match);
  }

  // Priority 2: preferred provider + any time
  if (preferredProviderId) {
    const providerSlots = day.slots.filter((s) => isPreferredProvider(s));
    if (providerSlots.length > 0) {
      // Among preferred provider slots, pick the one closest to original time
      const best = closestToTime(providerSlots, originalMinutes);
      if (best) return toTimeSlot(best);
    }
  }

  // Priority 3: any provider + preferred time window
  if (hasTimePreference) {
    const windowSlots = day.slots.filter((s) => isInTimeWindow(s));
    if (windowSlots.length > 0) {
      // Among time-window slots, pick the one closest to original time
      const best = closestToTime(windowSlots, originalMinutes);
      if (best) return toTimeSlot(best);
    }
  }

  // Priority 4: any provider, closest to original time
  const best = closestToTime(day.slots, originalMinutes);
  if (best) return toTimeSlot(best);

  // Fallback: return first available slot
  return toTimeSlot(day.slots[0]!);
}

/**
 * Given a day of week (0=Sunday, 6=Saturday) and a start date
 * (YYYY-MM-DD), return the NEXT occurrence of that day of week
 * as a YYYY-MM-DD string.
 *
 * If afterDate is the same day of week, returns the following week
 * (7 days later), not afterDate itself.
 */
export function getNextOccurrence(dayOfWeek: number, afterDate: string): string {
  const afterDow = getDayOfWeek(afterDate);

  // Calculate days until the target day of week
  let daysAhead = dayOfWeek - afterDow;

  // If target is same day or earlier in the week, jump to next week
  if (daysAhead <= 0) {
    daysAhead += 7;
  }

  return addDays(afterDate, daysAhead);
}

/**
 * Format a human-readable explanation for why a particular day is
 * being suggested for rebooking.
 *
 * Examples:
 *   - "Same day next week"
 *   - "Next available Tuesday"
 *   - "Your preferred provider has availability"
 *   - "Closest match to your usual time"
 *   - "Earliest available date"
 */
export function formatSuggestionReason(
  day: AvailableDay,
  input: RebookingInput,
): string {
  const { originalAppointmentDate, originalDayOfWeek, originalTime, preferences } = input;
  const daysBetween = getDaysBetween(originalAppointmentDate, day.date);
  const originalMinutes = timeToMinutes(originalTime);

  const reasons: string[] = [];

  // Check: same day of week and within 7-14 days (i.e., "next week")
  if (day.dayOfWeek === originalDayOfWeek && daysBetween >= 1 && daysBetween <= 14) {
    reasons.push('Same day next week');
  } else if (day.dayOfWeek === originalDayOfWeek) {
    const dayName = getDayName(day.dayOfWeek);
    reasons.push(`Next available ${dayName}`);
  }

  // Check: preferred provider available
  if (preferences.preferredProviderId) {
    const hasPreferred = day.slots.some(
      (s) => s.providerId === preferences.preferredProviderId,
    );
    if (hasPreferred) {
      reasons.push('Your preferred provider has availability');
    }
  }

  // Check: slot near the original time
  const hasNearOriginal = day.slots.some((s) => {
    const slotMin = timeToMinutes(s.startTime);
    return Math.abs(slotMin - originalMinutes) <= 60;
  });
  if (hasNearOriginal && reasons.length === 0) {
    reasons.push('Closest match to your usual time');
  }

  // Check: within preferred time window
  if (
    preferences.preferredTimeStart &&
    preferences.preferredTimeEnd &&
    reasons.length === 0
  ) {
    const prefStartMin = timeToMinutes(preferences.preferredTimeStart);
    const prefEndMin = timeToMinutes(preferences.preferredTimeEnd);
    const hasWindowMatch = day.slots.some((s) => {
      const slotMin = timeToMinutes(s.startTime);
      return slotMin >= prefStartMin && slotMin <= prefEndMin;
    });
    if (hasWindowMatch) {
      reasons.push('Available within your preferred time window');
    }
  }

  // Fallback: earliest available
  if (reasons.length === 0) {
    if (daysBetween <= 3) {
      reasons.push('Earliest available date');
    } else {
      const dayName = getDayName(day.dayOfWeek);
      reasons.push(`Next available ${dayName}`);
    }
  }

  return reasons[0]!;
}

/**
 * Calculate the absolute number of days between two YYYY-MM-DD dates.
 *
 * Uses manual date parsing — no date library dependency.
 */
export function getDaysBetween(date1: string, date2: string): number {
  const d1 = parseDateToEpochDays(date1);
  const d2 = parseDateToEpochDays(date2);
  return Math.abs(d2 - d1);
}

// ── Internal Helpers ─────────────────────────────────────────────

/**
 * Parse a "HH:MM" time string into total minutes since midnight.
 */
function timeToMinutes(t: string): number {
  const parts = t.split(':');
  const [h = 0, m = 0] = parts.map(Number);
  return h * 60 + m;
}

/**
 * Parse a YYYY-MM-DD string into the number of days since the Unix epoch.
 *
 * Uses UTC to avoid timezone drift. Returns an integer number of days
 * suitable for subtraction to get day differences.
 */
function parseDateToEpochDays(dateStr: string): number {
  const parts = dateStr.split('-');
  const [year = 0, month = 1, day = 1] = parts.map(Number);
  // Construct a UTC timestamp at noon to avoid DST edge cases
  const ms = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  return Math.floor(ms / 86_400_000);
}

/**
 * Add a number of days to a YYYY-MM-DD date string.
 * Returns a new YYYY-MM-DD string.
 */
function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-');
  const [year = 0, month = 1, day = 1] = parts.map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Get the day of week (0=Sunday, 6=Saturday) for a YYYY-MM-DD string.
 */
function getDayOfWeek(dateStr: string): number {
  const parts = dateStr.split('-');
  const [year = 0, month = 1, day = 1] = parts.map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return d.getUTCDay();
}

/**
 * Get a human-readable day name for a day-of-week number.
 */
function getDayName(dayOfWeek: number): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[dayOfWeek] ?? 'Unknown';
}

/**
 * From a list of slots, find the one whose start time is closest to
 * the target time (in minutes since midnight). Returns null if the
 * list is empty.
 */
function closestToTime<T extends { startTime: string }>(
  slots: T[],
  targetMinutes: number,
): T | null {
  if (slots.length === 0) return null;

  let best: T = slots[0]!;
  let bestDiff = Math.abs(timeToMinutes(best.startTime) - targetMinutes);

  for (let i = 1; i < slots.length; i++) {
    const slot = slots[i]!;
    const diff = Math.abs(timeToMinutes(slot.startTime) - targetMinutes);
    if (diff < bestDiff) {
      best = slot;
      bestDiff = diff;
    }
  }

  return best;
}
