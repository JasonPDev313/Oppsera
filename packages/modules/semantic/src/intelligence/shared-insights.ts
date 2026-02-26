// ── Shared Insights Service ──────────────────────────────────────
// Creates shareable links for AI insight results. Each shared insight
// gets a crypto-random token and a snapshot of the narrative, sections,
// and query result data. Supports expiration and view counting.

import { randomBytes } from 'node:crypto';
import { db } from '@oppsera/db';
import { semanticSharedInsights } from '@oppsera/db';
import { eq, and, desc, lt, or, isNull, sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { NarrativeSection } from '../llm/types';

// ── Types ────────────────────────────────────────────────────────

export interface CreateSharedInsightInput {
  tenantId: string;
  createdBy: string;
  userMessage: string;
  narrative: string;
  sections: NarrativeSection[];
  queryResult?: Record<string, unknown>[] | null;
  chartConfig?: Record<string, unknown> | null;
  evalTurnId?: string | null;
  sessionId?: string | null;
  title?: string | null;
  mode?: string | null;
  accessLevel?: 'public' | 'tenant' | 'restricted';
  allowedUserIds?: string[] | null;
  /** Expiration time in hours. Null = never expires. Default: 168 (7 days). */
  expiresInHours?: number | null;
}

export interface SharedInsight {
  id: string;
  tenantId: string;
  evalTurnId: string | null;
  sessionId: string | null;
  title: string | null;
  userMessage: string;
  narrative: string;
  sections: NarrativeSection[];
  queryResult: Record<string, unknown>[] | null;
  chartConfig: Record<string, unknown> | null;
  mode: string | null;
  shareToken: string;
  accessLevel: string;
  allowedUserIds: string[] | null;
  expiresAt: string | null;
  viewCount: number;
  createdBy: string;
  createdAt: string;
}

// ── Token Generation ────────────────────────────────────────────

/**
 * Generates a crypto-random 32-byte token encoded as base64url.
 * Unguessable — same pattern as guest pay tokens.
 */
function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

// ── Row Mapper ──────────────────────────────────────────────────

function rowToSharedInsight(
  row: typeof semanticSharedInsights.$inferSelect,
): SharedInsight {
  return {
    id: row.id,
    tenantId: row.tenantId,
    evalTurnId: row.evalTurnId,
    sessionId: row.sessionId,
    title: row.title,
    userMessage: row.userMessage,
    narrative: row.narrative,
    sections: (row.sections as NarrativeSection[]) ?? [],
    queryResult: (row.queryResult as Record<string, unknown>[]) ?? null,
    chartConfig: (row.chartConfig as Record<string, unknown>) ?? null,
    mode: row.mode,
    shareToken: row.shareToken,
    accessLevel: row.accessLevel,
    allowedUserIds: row.allowedUserIds,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Create ──────────────────────────────────────────────────────

/**
 * Creates a shared insight with a crypto-random share token.
 * Snapshots the narrative, sections, and query result at creation time.
 */
export async function createSharedInsight(
  input: CreateSharedInsightInput,
): Promise<SharedInsight> {
  const shareToken = generateShareToken();

  // Compute expiration
  let expiresAt: Date | null = null;
  const expiresInHours = input.expiresInHours ?? 168; // default 7 days
  if (expiresInHours !== null) {
    expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  }

  const [created] = await db
    .insert(semanticSharedInsights)
    .values({
      id: generateUlid(),
      tenantId: input.tenantId,
      evalTurnId: input.evalTurnId ?? null,
      sessionId: input.sessionId ?? null,
      title: input.title ?? null,
      userMessage: input.userMessage,
      narrative: input.narrative,
      sections: input.sections as unknown as Record<string, unknown>,
      queryResult: input.queryResult ?? null,
      chartConfig: input.chartConfig ?? null,
      mode: input.mode ?? null,
      shareToken,
      accessLevel: input.accessLevel ?? 'tenant',
      allowedUserIds: input.allowedUserIds ?? null,
      expiresAt,
      createdBy: input.createdBy,
    })
    .returning();

  return rowToSharedInsight(created!);
}

// ── Get by Token ────────────────────────────────────────────────

/**
 * Retrieves a shared insight by its share token. Increments the
 * view count on each access. Returns null if the token is not found
 * or the insight has expired.
 */
export async function getSharedInsight(
  shareToken: string,
): Promise<SharedInsight | null> {
  // Find the insight by token
  const [row] = await db
    .select()
    .from(semanticSharedInsights)
    .where(eq(semanticSharedInsights.shareToken, shareToken));

  if (!row) return null;

  // Check expiration
  if (row.expiresAt && row.expiresAt < new Date()) {
    return null;
  }

  // Increment view count (best-effort, non-blocking)
  await db
    .update(semanticSharedInsights)
    .set({
      viewCount: sql`${semanticSharedInsights.viewCount} + 1`,
    })
    .where(eq(semanticSharedInsights.id, row.id));

  // Return with incremented view count
  return rowToSharedInsight({
    ...row,
    viewCount: row.viewCount + 1,
  });
}

// ── List for Tenant ─────────────────────────────────────────────

/**
 * Lists shared insights for a tenant with cursor-based pagination.
 * Only returns non-expired insights (or insights with no expiration).
 */
export async function listSharedInsights(
  tenantId: string,
  limit: number = 20,
  cursor?: string,
): Promise<{
  items: SharedInsight[];
  cursor: string | null;
  hasMore: boolean;
}> {
  const now = new Date();
  const fetchLimit = limit + 1;

  const conditions = [
    eq(semanticSharedInsights.tenantId, tenantId),
    // Only non-expired or never-expiring
    or(
      isNull(semanticSharedInsights.expiresAt),
      sql`${semanticSharedInsights.expiresAt} > ${now}`,
    )!,
  ];

  // Cursor-based pagination using ID (ULIDs are time-sortable)
  if (cursor) {
    conditions.push(lt(semanticSharedInsights.id, cursor));
  }

  const rows = await db
    .select()
    .from(semanticSharedInsights)
    .where(and(...conditions))
    .orderBy(desc(semanticSharedInsights.createdAt))
    .limit(fetchLimit);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: items.map(rowToSharedInsight),
    cursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
    hasMore,
  };
}
