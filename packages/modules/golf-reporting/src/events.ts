/**
 * Golf event type definitions.
 * These interfaces describe the `data` payload inside an EventEnvelope
 * for each golf-domain event type.
 */

// ── tee_time.booked.v1 ──────────────────────────────────────────
export interface TeeTimeBookedData {
  teeTimeId: string;
  courseId: string;
  /** ISO 8601 UTC — the scheduled start of the tee time. */
  startAt: string;
  /** Number of player slots booked. */
  players: number;
  /** Green fee in cents. */
  greenFeeCents: number;
  /** Booking channel: 'online' | 'phone' | 'walk_in' | 'pro_shop' */
  bookingSource: string;
  customerId?: string;
  customerName?: string;
  /** Location ID (resolved from course). Optional — consumer falls back to timezone lookup. */
  locationId?: string;
  /** 'member' | 'public' | 'league' | 'outing' */
  bookingType?: string;
  /** Number of holes (defaults to 18 if omitted). */
  holes?: number;
  walkingCount?: number;
  ridingCount?: number;
}

// ── tee_time.cancelled.v1 ───────────────────────────────────────
export interface TeeTimeCancelledData {
  teeTimeId: string;
  courseId: string;
  startAt: string;
  players: number;
  cancelledAt: string;
  reason?: string;
}

// ── tee_time.no_show_marked.v1 ──────────────────────────────────
export interface TeeTimeNoShowData {
  teeTimeId: string;
  courseId: string;
  startAt: string;
  players: number;
  markedAt: string;
}

// ── tee_time.checked_in.v1 ──────────────────────────────────────
export interface TeeTimeCheckedInData {
  teeTimeId: string;
  courseId: string;
  startAt: string;
  players: number;
  checkedInAt: string;
  partySizeActual?: number;
  walkingCountActual?: number;
  ridingCountActual?: number;
}

// ── tee_time.started.v1 ─────────────────────────────────────────
export interface TeeTimeStartedData {
  teeTimeId: string;
  courseId: string;
  startAt: string;
  players: number;
  actualStartAt: string;
  /** Alias for actualStartAt (preferred). */
  startedAt?: string;
}

// ── tee_time.completed.v1 ───────────────────────────────────────
export interface TeeTimeCompletedData {
  teeTimeId: string;
  courseId: string;
  startAt: string;
  players: number;
  finishedAt: string;
  durationMinutes: number;
  /** 'on_pace' | 'slow' | 'fast' */
  paceStatus: string;
  /** Alias for finishedAt (preferred). */
  completedAt?: string;
  holesCompleted?: number;
}

// ── pace.checkpoint.v1 ──────────────────────────────────────────
export interface PaceCheckpointData {
  roundId: string;
  courseId: string;
  holeNumber: number;
  elapsedMinutes: number;
  expectedMinutes: number;
  /** 'on_pace' | 'slow' | 'fast' */
  status: string;
  /** Links checkpoint to a tee time reservation. */
  reservationId?: string;
}

// ── golf.folio.posted.v1 ────────────────────────────────────────
export interface GolfFolioPostedData {
  folioId: string;
  courseId: string;
  customerId?: string;
  /** Links folio to a tee time reservation for fact table revenue attribution. */
  reservationId?: string;
  /** Revenue breakdown in dollars (NUMERIC). */
  greenFee?: number;
  cartFee?: number;
  rangeFee?: number;
  foodBev?: number;
  proShop?: number;
  tax?: number;
  total?: number;
  /** Legacy fields (kept for backward compat). */
  lines?: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  totalCents?: number;
}

// ── Union type ──────────────────────────────────────────────────
export type GolfEvent =
  | TeeTimeBookedData
  | TeeTimeCancelledData
  | TeeTimeNoShowData
  | TeeTimeCheckedInData
  | TeeTimeStartedData
  | TeeTimeCompletedData
  | PaceCheckpointData
  | GolfFolioPostedData;
