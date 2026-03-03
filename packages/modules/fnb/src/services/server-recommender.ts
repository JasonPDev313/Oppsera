/**
 * HOST: Server assignment recommendation engine.
 *
 * Pure scoring algorithm — no DB imports.
 * Caller fetches data, passes it in, and gets back a ranked recommendation.
 */

// ── Types ────────────────────────────────────────────────────────

export interface ServerLoadSnapshot {
  serverUserId: string;
  openTabCount: number;
  activeSeatedCount: number;
  totalCoverCount: number;
  avgTicketCents: number;
  sectionId: string | null;
  sectionCapacity: number | null;
}

export interface SectionAssignment {
  sectionId: string;
  serverUserId: string;
  tableIds: string[];
}

export interface ServerRecommendation {
  serverUserId: string;
  score: number;
  reason: string;
}

export interface RecommendServerSettings {
  method: 'round_robin' | 'cover_balance' | 'manual';
  maxCoverDifference: number;
}

// ── Scoring Constants ────────────────────────────────────────────

const SCORE_SECTION_AFFINITY = 50;
const SCORE_COVER_BALANCE_MAX = 30;
const SCORE_TAB_BALANCE_MAX = 20;
const SCORE_ROTATION_BONUS = 10;

// ── Pure Algorithm ───────────────────────────────────────────────

/**
 * Recommend a server for a given table.
 *
 * Scoring breakdown (max 100 points + optional rotation bonus):
 *   +50  section affinity (server owns the table's section)
 *   +30  cover balance (fewer covers = higher score)
 *   +20  tab balance (fewer open tabs = higher score)
 *   +10  rotation bonus for round_robin (server has fewest covers among tie)
 *
 * Returns null when:
 *   - No server loads provided (no active servers)
 *   - Method is 'manual' (manager assigns manually)
 */
export function recommendServer(
  tableId: string,
  serverLoads: ServerLoadSnapshot[],
  sectionAssignments: SectionAssignment[],
  settings: RecommendServerSettings,
): ServerRecommendation | null {
  if (serverLoads.length === 0) return null;
  if (settings.method === 'manual') return null;

  // Find the section that contains this table
  const tableSection = sectionAssignments.find((sa) => sa.tableIds.includes(tableId));

  // Identify servers assigned to the table's section
  const sectionServerIds = tableSection
    ? sectionAssignments
        .filter((sa) => sa.sectionId === tableSection.sectionId)
        .map((sa) => sa.serverUserId)
    : [];

  const maxCovers = Math.max(...serverLoads.map((s) => s.totalCoverCount), 1);
  const maxTabs = Math.max(...serverLoads.map((s) => s.openTabCount), 1);

  // Score each server
  const scored = serverLoads.map((server) => {
    let score = 0;
    const reasons: string[] = [];

    // Section affinity
    if (tableSection && sectionServerIds.includes(server.serverUserId)) {
      score += SCORE_SECTION_AFFINITY;
      reasons.push('section match');
    }

    // Cover balance — fewer covers = higher portion of 30 points
    const coverBalanceScore =
      ((maxCovers - server.totalCoverCount) / maxCovers) * SCORE_COVER_BALANCE_MAX;
    score += coverBalanceScore;

    // Tab balance — fewer open tabs = higher portion of 20 points
    const tabBalanceScore =
      ((maxTabs - server.openTabCount) / maxTabs) * SCORE_TAB_BALANCE_MAX;
    score += tabBalanceScore;

    // Round-robin rotation bonus: servers with lowest covers among all tied
    if (settings.method === 'round_robin') {
      const minCoversOnFloor = Math.min(...serverLoads.map((s) => s.totalCoverCount));
      if (server.totalCoverCount === minCoversOnFloor) {
        score += SCORE_ROTATION_BONUS;
        reasons.push('next in rotation');
      }
    }

    return { server, score, reasons };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const runner = scored[1];

  if (!top) return null;

  // If the top two candidates have a cover gap > maxCoverDifference, strongly
  // prefer the server with fewer covers regardless of section affinity.
  if (
    runner &&
    Math.abs(top.server.totalCoverCount - runner.server.totalCoverCount) >
      settings.maxCoverDifference
  ) {
    const lowerCoverServer =
      top.server.totalCoverCount <= runner.server.totalCoverCount ? top : runner;

    const reasonParts: string[] = ['cover rebalance'];
    if (lowerCoverServer.reasons.length > 0) {
      reasonParts.push(...lowerCoverServer.reasons);
    }

    return {
      serverUserId: lowerCoverServer.server.serverUserId,
      score: lowerCoverServer.score,
      reason: reasonParts.join(', '),
    };
  }

  const reasonParts: string[] = top.reasons.length > 0
    ? top.reasons
    : ['balanced assignment'];

  return {
    serverUserId: top.server.serverUserId,
    score: top.score,
    reason: reasonParts.join(', '),
  };
}
