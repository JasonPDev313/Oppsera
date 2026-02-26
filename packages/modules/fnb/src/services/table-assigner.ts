/**
 * HOST V2: Table assignment intelligence.
 *
 * Pure scoring algorithm for optimal table-to-party matching.
 * DB queries are separate — the algorithm works on pre-fetched data.
 */

// ── Types ───────────────────────────────────────────────────────

export interface TableSuggestion {
  tableIds: string[];
  tableNumbers: string[];
  combinedCapacity: number;
  score: number;
  reasoning: string;
  serverId?: string;
  serverName?: string;
}

export interface SuggestTablesInput {
  tenantId: string;
  locationId: string;
  partySize: number;
  seatingPreference?: string;
  isVip?: boolean;
  customerId?: string;
}

export interface AvailableTable {
  id: string;
  tableNumber: string;
  capacity: number;
  sectionId?: string;
  serverId?: string;
  serverName?: string;
  tags: string[];        // e.g., ['outdoor', 'window', 'booth']
  isCombinable: boolean;
  adjacentTableIds: string[];  // IDs of tables that can be combined with this one
}

export interface ServerLoad {
  serverId: string;
  currentCovers: number;
}

export interface CustomerTableHistory {
  tableId: string;
  visitCount: number;
}

// ── Scoring Weights ─────────────────────────────────────────────

const WEIGHT_CAPACITY_FIT = 0.40;
const WEIGHT_SEATING_PREF = 0.25;
const WEIGHT_SERVER_BALANCE = 0.20;
const WEIGHT_VIP_PREF = 0.15;

const COMBINATION_PENALTY = 0.85;
const MAX_SUGGESTIONS = 3;

// ── Pure Algorithm Functions ────────────────────────────────────

/**
 * Score how well a table's capacity fits the party size.
 * Perfect fit = 1.0, oversized = lower score.
 */
export function scoreCapacityFit(
  tableCapacity: number,
  partySize: number,
  maxCapacityAtLocation: number,
): number {
  if (tableCapacity < partySize) return 0;
  if (maxCapacityAtLocation === 0) return 0.5;
  const excess = tableCapacity - partySize;
  return Math.max(0, 1 - (excess / maxCapacityAtLocation));
}

/**
 * Score how well a table matches the guest's seating preference.
 */
export function scoreSeatingPreference(
  tableTags: string[],
  preference?: string,
): number {
  if (!preference || preference === 'none') return 0.5; // no preference = neutral
  const normalizedTags = tableTags.map((t) => t.toLowerCase());
  const normalizedPref = preference.toLowerCase();
  if (normalizedTags.includes(normalizedPref)) return 1.0;
  return 0.0;
}

/**
 * Score based on server load balance.
 * Prefer servers with fewer current covers.
 */
export function scoreServerBalance(
  serverId: string | undefined,
  serverLoads: ServerLoad[],
): number {
  if (!serverId || serverLoads.length === 0) return 0.5;
  const maxCovers = Math.max(...serverLoads.map((s) => s.currentCovers), 1);
  const load = serverLoads.find((s) => s.serverId === serverId);
  if (!load) return 0.5;
  return Math.max(0, 1 - (load.currentCovers / maxCovers));
}

/**
 * Score based on VIP status and historical table preference.
 */
export function scoreVipPreference(
  tableId: string,
  isVip: boolean,
  tableTags: string[],
  customerHistory: CustomerTableHistory[],
): number {
  if (!isVip) return 0.5; // baseline for non-VIP

  // Check if customer has a history with this specific table
  const history = customerHistory.find((h) => h.tableId === tableId);
  if (history && history.visitCount > 0) return 1.0;

  // VIP without specific preference — prefer premium-tagged tables
  const premiumTags = ['vip', 'premium', 'window', 'booth'];
  const hasPremium = tableTags.some((t) => premiumTags.includes(t.toLowerCase()));
  return hasPremium ? 0.7 : 0.5;
}

/**
 * Generate a human-readable reasoning string for a suggestion.
 */
export function generateReasoning(
  tables: AvailableTable[],
  partySize: number,
  preference?: string,
): string {
  const isCombination = tables.length > 1;
  const tableNums = tables.map((t) => t.tableNumber).join('+');
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const serverName = tables[0]?.serverName;

  const parts: string[] = [];

  if (isCombination) {
    parts.push(`Combined tables ${tableNums}`);
    if (totalCapacity === partySize) {
      parts.push('exact fit');
    }
  } else {
    const table = tables[0]!;
    if (table.capacity === partySize) {
      parts.push(`Perfect fit: ${table.capacity}-top`);
    } else {
      parts.push(`${table.capacity}-top for party of ${partySize}`);
    }
  }

  if (preference && preference !== 'none') {
    const matchesPref = tables.some((t) =>
      t.tags.map((tag) => tag.toLowerCase()).includes(preference.toLowerCase()),
    );
    if (matchesPref) {
      parts.push(`matches ${preference} preference`);
    }
  }

  if (serverName) {
    parts.push(`in ${serverName}'s section`);
  }

  return parts.join(', ');
}

/**
 * Score a single table for a given party.
 */
export function scoreTable(
  table: AvailableTable,
  partySize: number,
  maxCapacity: number,
  preference: string | undefined,
  isVip: boolean,
  serverLoads: ServerLoad[],
  customerHistory: CustomerTableHistory[],
): number {
  const capacityScore = scoreCapacityFit(table.capacity, partySize, maxCapacity);
  const prefScore = scoreSeatingPreference(table.tags, preference);
  const serverScore = scoreServerBalance(table.serverId, serverLoads);
  const vipScore = scoreVipPreference(table.id, isVip, table.tags, customerHistory);

  return (
    capacityScore * WEIGHT_CAPACITY_FIT +
    prefScore * WEIGHT_SEATING_PREF +
    serverScore * WEIGHT_SERVER_BALANCE +
    vipScore * WEIGHT_VIP_PREF
  );
}

/**
 * Find combinable table pairs from available tables.
 */
export function findCombinations(
  tables: AvailableTable[],
  partySize: number,
): AvailableTable[][] {
  const combos: AvailableTable[][] = [];

  for (let i = 0; i < tables.length; i++) {
    const t1 = tables[i]!;
    if (!t1.isCombinable) continue;

    for (let j = i + 1; j < tables.length; j++) {
      const t2 = tables[j]!;
      if (!t2.isCombinable) continue;

      // Check if these tables are adjacent (can be combined)
      if (!t1.adjacentTableIds.includes(t2.id)) continue;

      const combined = t1.capacity + t2.capacity;
      if (combined >= partySize) {
        combos.push([t1, t2]);
      }
    }
  }

  return combos;
}

/**
 * Core table suggestion algorithm.
 * Takes pre-fetched data and returns scored suggestions.
 */
export function computeTableSuggestions(
  availableTables: AvailableTable[],
  partySize: number,
  preference: string | undefined,
  isVip: boolean,
  serverLoads: ServerLoad[],
  customerHistory: CustomerTableHistory[],
): TableSuggestion[] {
  const suggestions: TableSuggestion[] = [];

  // Find max capacity for scoring normalization
  const maxCapacity = availableTables.length > 0
    ? Math.max(...availableTables.map((t) => t.capacity))
    : 0;

  // Score single tables that fit
  const fittingTables = availableTables.filter((t) => t.capacity >= partySize);

  for (const table of fittingTables) {
    const score = scoreTable(
      table, partySize, maxCapacity, preference, isVip, serverLoads, customerHistory,
    );
    suggestions.push({
      tableIds: [table.id],
      tableNumbers: [table.tableNumber],
      combinedCapacity: table.capacity,
      score,
      reasoning: generateReasoning([table], partySize, preference),
      serverId: table.serverId,
      serverName: table.serverName,
    });
  }

  // If no single table fits, look for combinations
  if (fittingTables.length === 0) {
    const combos = findCombinations(availableTables, partySize);
    for (const combo of combos) {
      const avgScore = combo.reduce((sum, t) =>
        sum + scoreTable(t, partySize, maxCapacity, preference, isVip, serverLoads, customerHistory),
      0) / combo.length;

      suggestions.push({
        tableIds: combo.map((t) => t.id),
        tableNumbers: combo.map((t) => t.tableNumber),
        combinedCapacity: combo.reduce((sum, t) => sum + t.capacity, 0),
        score: avgScore * COMBINATION_PENALTY,
        reasoning: generateReasoning(combo, partySize, preference),
        serverId: combo[0]?.serverId,
        serverName: combo[0]?.serverName,
      });
    }
  }

  // Sort by score descending, return top N
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
