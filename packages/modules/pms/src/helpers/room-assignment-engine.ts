/**
 * Room assignment engine — pure functions for scoring and ranking rooms
 * based on guest preferences. No DB access, no side effects.
 */

export interface RoomScore {
  roomId: string;
  score: number;
  reasons: string[];
}

export interface AssignmentContext {
  guestPreferences: Record<string, unknown>; // from pms_guests.room_preferences_json
  isVip: boolean;
  isRepeatGuest: boolean;
  roomTypeId: string;
}

export interface ScoredRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  floor: string | null;
  viewType: string | null;
  wing: string | null;
  accessibilityJson: Record<string, unknown>;
  connectingRoomIds: string[];
}

export interface PreferenceWeight {
  name: string;
  weight: number;
}

/**
 * Scores a single room against an assignment context using weighted preferences.
 * Each preference dimension is scored 0-100, multiplied by weight, then summed.
 * VIP and repeat guest bonuses are added as flat points on top.
 */
export function scoreRoom(
  room: ScoredRoom,
  context: AssignmentContext,
  weights: PreferenceWeight[],
): RoomScore {
  let score = 0;
  const reasons: string[] = [];

  // Build a quick lookup of active weights
  const weightMap = new Map<string, number>();
  for (const w of weights) {
    weightMap.set(w.name, w.weight);
  }

  // ── Floor preference ──────────────────────────────────────────
  const floorWeight = weightMap.get('floor_preference') ?? 0;
  if (floorWeight > 0 && room.floor != null) {
    const preferredFloor = String(context.guestPreferences.floor ?? '');
    if (preferredFloor && room.floor === preferredFloor) {
      score += floorWeight;
      reasons.push(`Floor match: ${room.floor}`);
    }
  }

  // ── View preference ───────────────────────────────────────────
  const viewWeight = weightMap.get('view') ?? 0;
  if (viewWeight > 0 && room.viewType != null) {
    const preferredView = String(context.guestPreferences.view ?? '');
    if (preferredView && room.viewType === preferredView) {
      score += viewWeight;
      reasons.push(`View match: ${room.viewType}`);
    }
  }

  // ── Quiet room preference ─────────────────────────────────────
  // Prefer higher floors or specific wings known to be quieter
  const quietWeight = weightMap.get('quiet') ?? 0;
  if (quietWeight > 0) {
    const wantsQuiet = context.guestPreferences.quiet === true;
    if (wantsQuiet) {
      const floorNum = parseInt(room.floor ?? '0', 10);
      if (!isNaN(floorNum) && floorNum >= 3) {
        // Higher floors get full quiet score
        score += quietWeight;
        reasons.push(`Quiet: high floor (${room.floor})`);
      } else if (room.wing != null) {
        const quietWings = context.guestPreferences.quietWings;
        if (Array.isArray(quietWings) && quietWings.includes(room.wing)) {
          score += quietWeight;
          reasons.push(`Quiet: preferred wing (${room.wing})`);
        }
      }
    }
  }

  // ── Accessibility preference ──────────────────────────────────
  const accessWeight = weightMap.get('accessibility') ?? 0;
  if (accessWeight > 0) {
    const needs = context.guestPreferences.accessibility;
    if (needs != null && typeof needs === 'object' && !Array.isArray(needs)) {
      const needsRecord = needs as Record<string, boolean>;
      const roomAccess = room.accessibilityJson;
      let allMet = true;
      let anyNeeded = false;

      for (const [key, needed] of Object.entries(needsRecord)) {
        if (needed) {
          anyNeeded = true;
          if (!roomAccess[key]) {
            allMet = false;
            break;
          }
        }
      }

      if (anyNeeded && allMet) {
        score += accessWeight;
        reasons.push('Accessibility needs met');
      } else if (anyNeeded && !allMet) {
        // Penalize rooms that cannot meet accessibility needs
        score -= accessWeight;
        reasons.push('Accessibility needs NOT met (penalty)');
      }
    }
  }

  // ── Wing preference ───────────────────────────────────────────
  const wingWeight = weightMap.get('wing') ?? 0;
  if (wingWeight > 0 && room.wing != null) {
    const preferredWing = String(context.guestPreferences.wing ?? '');
    if (preferredWing && room.wing === preferredWing) {
      score += wingWeight;
      reasons.push(`Wing match: ${room.wing}`);
    }
  }

  // ── VIP bonus ─────────────────────────────────────────────────
  if (context.isVip) {
    score += 20;
    reasons.push('VIP bonus: +20');
  }

  // ── Repeat guest bonus ────────────────────────────────────────
  if (context.isRepeatGuest) {
    score += 10;
    reasons.push('Repeat guest bonus: +10');
  }

  return { roomId: room.id, score, reasons };
}

/**
 * Scores all rooms against an assignment context and returns them
 * ranked by score descending (best match first).
 */
export function rankRooms(
  rooms: ScoredRoom[],
  context: AssignmentContext,
  weights: PreferenceWeight[],
): RoomScore[] {
  // Filter to only rooms matching the required room type
  const eligible = rooms.filter((r) => r.roomTypeId === context.roomTypeId);

  const scored = eligible.map((room) => scoreRoom(room, context, weights));

  // Sort by score descending, break ties by roomId for determinism
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.roomId.localeCompare(b.roomId);
  });

  return scored;
}
