import { eq, and, or, sql } from 'drizzle-orm';
import {
  db,
  aiAssistantContentInvalidation,
  aiSupportAnswerCards,
  aiAssistantAnswerMemory,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────────

export interface InvalidationRecord {
  id: string;
  answerMemoryId: string | null;
  answerCardId: string | null;
  invalidationReason: string;
  changedFiles: string[];
  repoSha: string | null;
  invalidatedAt: Date;
}

export interface InvalidateOnCodeChangeResult {
  answerCardsMarkedStale: number;
  answerMemoryMarkedStale: number;
  invalidationRecordsInserted: number;
}

// ── File → Route/Module Mapping ──────────────────────────────────

/**
 * Derive a set of route prefixes and module keys from a list of changed files.
 * Used to find answer cards and memory entries that may be affected.
 *
 * Examples:
 *   apps/web/src/app/pos/orders/page.tsx     → route: /pos/orders, module: orders
 *   packages/modules/catalog/src/...          → module: catalog
 *   apps/web/src/app/settings/...             → route: /settings
 */
function deriveAffectedRoutesAndModules(changedFiles: string[]): {
  routes: string[];
  moduleKeys: string[];
} {
  const routes = new Set<string>();
  const moduleKeys = new Set<string>();

  for (const file of changedFiles) {
    // Normalize to forward slashes
    const normalized = file.replace(/\\/g, '/');

    // Extract module from packages/modules/{module}/...
    const moduleMatch = normalized.match(/^packages\/modules\/([^/]+)\//);
    if (moduleMatch?.[1]) {
      moduleKeys.add(moduleMatch[1]);
    }

    // Extract route from apps/web/src/app/{...}/page.tsx or layout.tsx
    const appRouteMatch = normalized.match(/^apps\/web\/src\/app\/(.+?)\/(page|layout)\.(tsx|ts)$/);
    if (appRouteMatch?.[1]) {
      // Convert file path segments to URL route
      const routeSegments = appRouteMatch[1]
        .split('/')
        // Remove Next.js route groups (parentheses)
        .filter((seg) => !seg.startsWith('('))
        // Keep dynamic segments as-is ([slug] → [slug])
        .join('/');
      if (routeSegments) {
        routes.add(`/${routeSegments}`);
      }
    }

    // Extract from API routes — map to module based on first path segment
    const apiRouteMatch = normalized.match(/^apps\/web\/src\/app\/api\/v1\/([^/]+)/);
    if (apiRouteMatch?.[1]) {
      const apiModule = apiRouteMatch[1].replace(/-/g, '_');
      moduleKeys.add(apiModule);
    }
  }

  return {
    routes: Array.from(routes),
    moduleKeys: Array.from(moduleKeys),
  };
}

// ── Invalidation Logic ────────────────────────────────────────────

/**
 * When files change (e.g. from a merged PR), mark related answer cards
 * and answer memory entries as stale, and insert invalidation records.
 *
 * All DB ops are awaited (no fire-and-forget).
 */
export async function invalidateOnCodeChange(
  changedFiles: string[],
  repoSha: string,
): Promise<InvalidateOnCodeChangeResult> {
  if (changedFiles.length === 0) {
    return {
      answerCardsMarkedStale: 0,
      answerMemoryMarkedStale: 0,
      invalidationRecordsInserted: 0,
    };
  }

  const { routes, moduleKeys } = deriveAffectedRoutesAndModules(changedFiles);

  let answerCardsMarkedStale = 0;
  let answerMemoryMarkedStale = 0;
  let invalidationRecordsInserted = 0;

  const now = new Date();
  const invalidationReason = `Code change in repo SHA ${repoSha.slice(0, 7)}: ${changedFiles.length} file(s) changed`;

  // ── Find and invalidate answer cards ──
  const affectedCards = await findAffectedAnswerCards(routes, moduleKeys);

  for (const card of affectedCards) {
    // Mark card as stale if it's currently active
    if (card.status === 'active') {
      await db
        .update(aiSupportAnswerCards)
        .set({ status: 'stale', updatedAt: now })
        .where(eq(aiSupportAnswerCards.id, card.id));
      answerCardsMarkedStale++;
    }

    // Insert invalidation record for this card
    await db.insert(aiAssistantContentInvalidation).values({
      id: generateUlid(),
      answerCardId: card.id,
      answerMemoryId: null,
      invalidationReason,
      changedFilesJson: changedFiles,
      repoSha,
      invalidatedAt: now,
      createdAt: now,
    });
    invalidationRecordsInserted++;
  }

  // ── Find and invalidate answer memory ──
  const affectedMemory = await findAffectedAnswerMemory(routes, moduleKeys);

  for (const memory of affectedMemory) {
    // Insert invalidation record for this memory entry
    await db.insert(aiAssistantContentInvalidation).values({
      id: generateUlid(),
      answerMemoryId: memory.id,
      answerCardId: null,
      invalidationReason,
      changedFilesJson: changedFiles,
      repoSha,
      invalidatedAt: now,
      createdAt: now,
    });
    invalidationRecordsInserted++;
    answerMemoryMarkedStale++;
  }

  return {
    answerCardsMarkedStale,
    answerMemoryMarkedStale,
    invalidationRecordsInserted,
  };
}

/**
 * Find answer cards whose route or moduleKey overlaps with the affected routes/modules.
 */
async function findAffectedAnswerCards(
  routes: string[],
  moduleKeys: string[],
): Promise<Array<{ id: string; status: string }>> {
  if (routes.length === 0 && moduleKeys.length === 0) {
    return [];
  }

  const conditions = [];

  if (routes.length > 0) {
    conditions.push(
      or(...routes.map((r) => eq(aiSupportAnswerCards.route, r))),
    );
  }

  if (moduleKeys.length > 0) {
    conditions.push(
      or(...moduleKeys.map((m) => eq(aiSupportAnswerCards.moduleKey, m))),
    );
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : or(...conditions);

  const cards = await db
    .select({ id: aiSupportAnswerCards.id, status: aiSupportAnswerCards.status })
    .from(aiSupportAnswerCards)
    .where(whereClause);

  return Array.from(cards as Iterable<{ id: string; status: string }>);
}

/**
 * Find answer memory entries whose screenKey or moduleKey overlaps with affected routes/modules.
 */
async function findAffectedAnswerMemory(
  routes: string[],
  moduleKeys: string[],
): Promise<Array<{ id: string }>> {
  if (routes.length === 0 && moduleKeys.length === 0) {
    return [];
  }

  // Only target approved memory (pending/rejected don't need invalidation)
  const conditions = [eq(aiAssistantAnswerMemory.reviewStatus, 'approved')];
  const matchConditions = [];

  if (routes.length > 0) {
    matchConditions.push(
      or(...routes.map((r) => eq(aiAssistantAnswerMemory.screenKey, r))),
    );
  }

  if (moduleKeys.length > 0) {
    matchConditions.push(
      or(...moduleKeys.map((m) => eq(aiAssistantAnswerMemory.moduleKey, m))),
    );
  }

  if (matchConditions.length > 0) {
    const matchClause = matchConditions.length === 1 ? matchConditions[0]! : or(...matchConditions)!;
    conditions.push(matchClause);
  }

  const memories = await db
    .select({ id: aiAssistantAnswerMemory.id })
    .from(aiAssistantAnswerMemory)
    .where(and(...conditions));

  return Array.from(memories as Iterable<{ id: string }>);
}

// ── Staleness Check ───────────────────────────────────────────────

/**
 * Check if an answer card has been invalidated (has any invalidation records).
 */
export async function checkStaleness(answerCardId: string): Promise<{
  isStale: boolean;
  latestInvalidation: InvalidationRecord | null;
}> {
  const records = await db
    .select()
    .from(aiAssistantContentInvalidation)
    .where(eq(aiAssistantContentInvalidation.answerCardId, answerCardId))
    .orderBy(sql`${aiAssistantContentInvalidation.invalidatedAt} DESC`)
    .limit(1);

  const results = Array.from(records as Iterable<typeof records[0]>);

  if (results.length === 0 || !results[0]) {
    return { isStale: false, latestInvalidation: null };
  }

  const record = results[0];
  return {
    isStale: true,
    latestInvalidation: {
      id: record.id,
      answerMemoryId: record.answerMemoryId,
      answerCardId: record.answerCardId,
      invalidationReason: record.invalidationReason,
      changedFiles: Array.isArray(record.changedFilesJson) ? (record.changedFilesJson as string[]) : [],
      repoSha: record.repoSha,
      invalidatedAt: record.invalidatedAt,
    },
  };
}

// ── Invalidation History ──────────────────────────────────────────

/**
 * Get the invalidation history for a given entity (answer card or answer memory entry).
 */
export async function getInvalidationHistory(
  entityId: string,
  entityType: 'answer_card' | 'answer_memory',
): Promise<InvalidationRecord[]> {
  const whereClause =
    entityType === 'answer_card'
      ? eq(aiAssistantContentInvalidation.answerCardId, entityId)
      : eq(aiAssistantContentInvalidation.answerMemoryId, entityId);

  const records = await db
    .select()
    .from(aiAssistantContentInvalidation)
    .where(whereClause)
    .orderBy(sql`${aiAssistantContentInvalidation.invalidatedAt} DESC`)
    .limit(50);

  return Array.from(records as Iterable<typeof records[0]>).map((record) => ({
    id: record.id,
    answerMemoryId: record.answerMemoryId,
    answerCardId: record.answerCardId,
    invalidationReason: record.invalidationReason,
    changedFiles: Array.isArray(record.changedFilesJson) ? (record.changedFilesJson as string[]) : [],
    repoSha: record.repoSha,
    invalidatedAt: record.invalidatedAt,
  }));
}
