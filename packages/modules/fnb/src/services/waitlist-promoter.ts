// ── Waitlist Auto-Promoter ─────────────────────────────────────────────────
// Pure scoring function — NO database imports, fully unit-testable.
// Called by handleTableAvailableForWaitlist and offerTableToWaitlist.

// ── Public Types ──────────────────────────────────────────────────────────

export interface WaitlistEntryForPromotion {
  id: string;
  partySize: number;
  priority: number;
  isVip: boolean;
  seatingPreference: string | null;
  addedAt: string;           // ISO timestamp — used for position tiebreaking
  status: string;            // 'waiting' | 'notified' | …
  offerDeclinedCount: number;
  offeredTableId: string | null;
  offerExpiresAt?: string | null; // ISO timestamp or null — used to detect stale offers
}

export interface TableForPromotion {
  id: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  sectionId: string | null;
}

export interface PromotionMatch {
  entryId: string;
  score: number;
  reasons: string[];
}

// ── Scoring Constants ─────────────────────────────────────────────────────

const BASE_POSITION_SCORE = 100;   // subtract 1 per rank position
const VIP_BONUS = 50;
const PRIORITY_BONUS_PER_LEVEL = 30;
const SIZE_FIT_BONUS = 20;         // partySize >= capacityMin → good utilization
const DECLINE_PENALTY = 10;        // per prior decline

// ── rankWaitlistForTable ──────────────────────────────────────────────────

/**
 * Rank all eligible waitlist entries for a specific table.
 *
 * Eligibility rules:
 *  - Status must be 'waiting' or 'notified'
 *  - Must NOT have an active pending offer on another table
 *    (offeredTableId is non-null AND offer has not expired)
 *  - partySize must be <= table.capacityMax
 *
 * Scoring (higher = better match):
 *  - Base: 100 - (rank position among eligible entries, 0-indexed)
 *  - VIP bonus: +50
 *  - Priority bonus: +30 * priority (only when settings.priorityEnabled)
 *  - Size fit bonus: +20 if partySize >= capacityMin
 *  - Decline penalty: -10 per prior decline
 *
 * Returns matches sorted by score DESC. Caller should take [0] as the winner.
 */
export function rankWaitlistForTable(
  entries: WaitlistEntryForPromotion[],
  table: TableForPromotion,
  settings: { priorityEnabled: boolean },
): PromotionMatch[] {
  const now = new Date();

  // ── Step 1: Filter eligible entries ─────────────────────────────────────

  const eligible = entries.filter((entry) => {
    // Only active statuses
    if (entry.status !== 'waiting' && entry.status !== 'notified') return false;

    // Guard against zero/negative party size (missing or corrupt data)
    if (entry.partySize <= 0) return false;

    // Party must fit the table (table with capacityMax 0 has no valid parties)
    if (table.capacityMax <= 0) return false;
    if (entry.partySize > table.capacityMax) return false;

    // Skip if there is a live (non-expired) pending offer on a different table
    if (entry.offeredTableId !== null) {
      // If no expiry recorded we treat it as still active
      if (!entry.offerExpiresAt) return false;
      const expiresAt = new Date(entry.offerExpiresAt);
      if (expiresAt > now) return false; // offer still live — skip
      // Expired offer: eligible to be re-offered
    }

    return true;
  });

  if (eligible.length === 0) return [];

  // ── Step 2: Sort eligible entries by arrival order so position rank is stable
  const sorted = [...eligible].sort(
    (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(),
  );

  // ── Step 3: Score each entry ─────────────────────────────────────────────

  const matches: PromotionMatch[] = sorted.map((entry, index) => {
    const reasons: string[] = [];
    let score = 0;

    // Base positional score (earlier = higher)
    const positionalScore = BASE_POSITION_SCORE - index;
    score += positionalScore;
    reasons.push(`position ${index + 1} → +${positionalScore}`);

    // VIP bonus
    if (entry.isVip) {
      score += VIP_BONUS;
      reasons.push(`VIP → +${VIP_BONUS}`);
    }

    // Priority bonus (only when feature is enabled)
    if (settings.priorityEnabled && entry.priority > 0) {
      const bonus = PRIORITY_BONUS_PER_LEVEL * entry.priority;
      score += bonus;
      reasons.push(`priority ${entry.priority} → +${bonus}`);
    }

    // Size fit bonus (efficient table utilization)
    if (entry.partySize >= table.capacityMin) {
      score += SIZE_FIT_BONUS;
      reasons.push(`size fit (${entry.partySize} >= ${table.capacityMin}) → +${SIZE_FIT_BONUS}`);
    }

    // Decline penalty
    if (entry.offerDeclinedCount > 0) {
      const penalty = DECLINE_PENALTY * entry.offerDeclinedCount;
      score -= penalty;
      reasons.push(`${entry.offerDeclinedCount} prior decline(s) → -${penalty}`);
    }

    return { entryId: entry.id, score, reasons };
  });

  // ── Step 4: Sort by score DESC ────────────────────────────────────────────

  matches.sort((a, b) => b.score - a.score);

  return matches;
}
