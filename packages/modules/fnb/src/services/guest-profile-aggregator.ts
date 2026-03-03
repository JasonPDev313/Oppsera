// ── Guest Profile Aggregator ─────────────────────────────────────────
// Pure functions — NO DB imports. All inputs/outputs are plain data.

// ── Reliability Score ─────────────────────────────────────────────────

/**
 * Compute reliability score from visit history.
 * Score: 0-100 where 100 = perfectly reliable.
 * Formula: 100 - (noShowRate * 60) - (cancelRate * 20), clamped to [0, 100]
 *
 * Rates are computed against total encounters (visits + no-shows + cancels).
 * Returns 100 when visitCount is 0 (no history = assume reliable).
 */
export function computeReliabilityScore(
  visitCount: number,
  noShowCount: number,
  cancelCount: number,
): number {
  const totalEncounters = visitCount + noShowCount + cancelCount;
  if (totalEncounters === 0) return 100;

  const noShowRate = noShowCount / totalEncounters;
  const cancelRate = cancelCount / totalEncounters;

  const score = 100 - noShowRate * 60 - cancelRate * 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Guest Segment ─────────────────────────────────────────────────────

/**
 * Derive guest segment from spending patterns and visit frequency.
 * Segments: 'new' (<=2 visits), 'regular' (3-10), 'loyal' (11-25), 'vip' (>25 or top spend)
 * vipThresholdCents defaults to 50000 (=$500 total lifetime spend)
 */
export function deriveGuestSegment(
  visitCount: number,
  totalSpendCents: number,
  vipThresholdCents = 50000,
): 'new' | 'regular' | 'loyal' | 'vip' {
  if (visitCount > 25 || totalSpendCents >= vipThresholdCents) return 'vip';
  if (visitCount >= 11) return 'loyal';
  if (visitCount >= 3) return 'regular';
  return 'new';
}

// ── Merge Visit Data ──────────────────────────────────────────────────

export interface GuestProfileSummary {
  visitCount: number;
  noShowCount: number;
  cancelCount: number;
  totalSpendCents: number;
  avgTicketCents: number | null;
  lastVisitDate: string | null;
  firstVisitDate: string | null;
  preferredTables: string | null;
  preferredServer: string | null;
}

export interface NewVisitData {
  visitDate: string;        // YYYY-MM-DD
  spendCents: number;
  tableId?: string;
  serverUserId?: string;
  wasNoShow?: boolean;
  wasCanceled?: boolean;
}

export interface GuestProfileUpdate {
  visitCount: number;
  noShowCount: number;
  cancelCount: number;
  totalSpendCents: number;
  avgTicketCents: number;
  lastVisitDate: string | null;
  firstVisitDate: string | null;
  preferredTables: string | null;
  preferredServer: string | null;
  reliabilityScore: number;
  segment: string;
}

/**
 * Merge visit data to produce an updated guest profile summary.
 * Takes existing profile and new visit data, returns updated fields.
 *
 * - No-shows and cancels do NOT increment visitCount or totalSpend
 * - preferredTables: updated to the new tableId when provided (single-value heuristic)
 * - preferredServer: updated to the new serverUserId when provided
 */
export function mergeVisitData(
  existing: GuestProfileSummary,
  newVisit: NewVisitData,
): GuestProfileUpdate {
  const wasNoShow = newVisit.wasNoShow === true;
  const wasCanceled = newVisit.wasCanceled === true;
  const isActualVisit = !wasNoShow && !wasCanceled;

  const noShowCount = existing.noShowCount + (wasNoShow ? 1 : 0);
  const cancelCount = existing.cancelCount + (wasCanceled ? 1 : 0);
  const visitCount = existing.visitCount + (isActualVisit ? 1 : 0);

  const totalSpendCents = existing.totalSpendCents + (isActualVisit ? newVisit.spendCents : 0);

  // avgTicketCents = total spend / visit count (only actual visits count)
  const avgTicketCents = visitCount > 0 ? Math.round(totalSpendCents / visitCount) : 0;

  // Date tracking: only advance dates on actual visits — no-shows and cancels
  // must not pollute the visit date range.
  const firstVisitDate =
    isActualVisit
      ? existing.firstVisitDate === null || newVisit.visitDate < existing.firstVisitDate
        ? newVisit.visitDate
        : existing.firstVisitDate
      : existing.firstVisitDate;

  const lastVisitDate =
    isActualVisit
      ? existing.lastVisitDate === null || newVisit.visitDate > existing.lastVisitDate
        ? newVisit.visitDate
        : existing.lastVisitDate
      : existing.lastVisitDate;

  // Preferred tables: update when a new tableId is provided for an actual visit
  const preferredTables =
    isActualVisit && newVisit.tableId
      ? newVisit.tableId
      : existing.preferredTables ?? null;

  // Preferred server: update when a new serverUserId is provided for an actual visit
  const preferredServer =
    isActualVisit && newVisit.serverUserId
      ? newVisit.serverUserId
      : existing.preferredServer ?? null;

  const reliabilityScore = computeReliabilityScore(visitCount, noShowCount, cancelCount);
  const segment = deriveGuestSegment(visitCount, totalSpendCents);

  return {
    visitCount,
    noShowCount,
    cancelCount,
    totalSpendCents,
    avgTicketCents,
    lastVisitDate,
    firstVisitDate,
    preferredTables,
    preferredServer,
    reliabilityScore,
    segment,
  };
}

export interface GuestReservationData {
  status: string;            // 'completed' | 'seated' | 'no_show' | 'canceled' | 'confirmed' | etc.
  date: string;              // YYYY-MM-DD
  tableId?: string;
  partySize: number;
  seatingPreference?: string;
}

export interface GuestTabData {
  totalCents: number;
  items: Array<{ catalogItemId: string; name: string; qty: number }>;
  tableId?: string;
  serverUserId?: string;
}

export interface GuestProfileData {
  visitCount: number;
  noShowCount: number;
  cancelCount: number;
  avgTicketCents: number;
  totalSpendCents: number;
  lastVisitDate: string | null;
  firstVisitDate: string | null;
  preferredTables: string;          // comma-separated table IDs, most frequent first
  preferredServer: string | null;   // most common serverUserId from tabs
  frequentItems: Array<{ catalogItemId: string; name: string; count: number }>;
  noShowRate: number;               // 0–1 fraction
}

/**
 * Aggregate guest reservation and tab data into a unified profile.
 *
 * visitCount   = reservations in terminal positive statuses + tab count
 * noShowCount  = reservations with status 'no_show'
 * cancelCount  = reservations with status 'canceled'
 * preferredTables = top table IDs by visit frequency (from tabs), comma-separated
 * preferredServer = server with most tab assignments
 * frequentItems   = top 5 catalog items by total quantity across all tabs
 * noShowRate      = noShowCount / (visitCount + noShowCount), or 0 if no history
 */
export function aggregateGuestProfile(
  reservations: GuestReservationData[],
  tabs: GuestTabData[],
): GuestProfileData {
  // ── Reservation metrics ────────────────────────────────────────────
  let noShowCount = 0;
  let cancelCount = 0;
  let completedReservationCount = 0;

  const allDates: string[] = [];

  for (const res of reservations) {
    if (res.status === 'no_show') {
      noShowCount++;
    } else if (res.status === 'canceled') {
      cancelCount++;
    } else if (res.status === 'completed' || res.status === 'seated') {
      completedReservationCount++;
      allDates.push(res.date);
    }
  }

  // ── Tab metrics ─────────────────────────────────────────────────────
  let totalSpendCents = 0;
  const tableFrequency = new Map<string, number>();
  const serverFrequency = new Map<string, number>();
  const itemTally = new Map<string, { catalogItemId: string; name: string; count: number }>();

  for (const tab of tabs) {
    totalSpendCents += tab.totalCents;

    if (tab.tableId) {
      tableFrequency.set(tab.tableId, (tableFrequency.get(tab.tableId) ?? 0) + 1);
    }

    if (tab.serverUserId) {
      serverFrequency.set(tab.serverUserId, (serverFrequency.get(tab.serverUserId) ?? 0) + 1);
    }

    for (const item of tab.items) {
      const existing = itemTally.get(item.catalogItemId);
      if (existing) {
        existing.count += item.qty;
      } else {
        itemTally.set(item.catalogItemId, {
          catalogItemId: item.catalogItemId,
          name: item.name,
          count: item.qty,
        });
      }
    }
  }

  // visitCount = completed/seated reservations + number of tabs closed
  const visitCount = completedReservationCount + tabs.length;

  // avgTicketCents = totalSpend / number of tabs (not total visits)
  const avgTicketCents = tabs.length > 0 ? Math.round(totalSpendCents / tabs.length) : 0;

  // noShowRate based on all guest encounters (visits + no-shows)
  const totalEncounters = visitCount + noShowCount;
  const noShowRate = totalEncounters > 0 ? noShowCount / totalEncounters : 0;

  // ── Date ranges ─────────────────────────────────────────────────────
  // Collect dates from tabs too (tabs don't have a date field, so we rely on reservation dates)
  // Sort all collected dates
  const sortedDates = allDates.slice().sort();
  const firstVisitDate = sortedDates.length > 0 ? sortedDates[0]! : null;
  const lastVisitDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1]! : null;

  // ── Preferred tables (sorted by frequency desc, comma-separated) ───
  const preferredTables = Array.from(tableFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tableId]) => tableId)
    .join(',');

  // ── Preferred server (most frequent) ──────────────────────────────
  let preferredServer: string | null = null;
  let maxServerCount = 0;
  for (const [serverId, count] of serverFrequency.entries()) {
    if (count > maxServerCount) {
      maxServerCount = count;
      preferredServer = serverId;
    }
  }

  // ── Top 5 frequent items ───────────────────────────────────────────
  const frequentItems = Array.from(itemTally.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    visitCount,
    noShowCount,
    cancelCount,
    avgTicketCents,
    totalSpendCents,
    lastVisitDate,
    firstVisitDate,
    preferredTables,
    preferredServer,
    frequentItems,
    noShowRate,
  };
}
