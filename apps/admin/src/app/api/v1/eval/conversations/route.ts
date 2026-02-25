import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalSessions,
  semanticEvalTurns,
} from '@oppsera/db';
import { sql, and, desc, eq } from 'drizzle-orm';

// ── GET: list conversation sessions with aggregated metrics ─────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const limit = Number(searchParams.get('limit') ?? '20');
  const cursor = searchParams.get('cursor');
  const tenantId = searchParams.get('tenantId');
  const status = searchParams.get('status');

  const conditions = [];
  if (cursor) conditions.push(sql`${semanticEvalSessions.id} < ${cursor}`);
  if (tenantId) conditions.push(eq(semanticEvalSessions.tenantId, tenantId));
  if (status) conditions.push(eq(semanticEvalSessions.status, status));

  // Session with aggregated turn metrics
  const rows = await db
    .select({
      id: semanticEvalSessions.id,
      tenantId: semanticEvalSessions.tenantId,
      userId: semanticEvalSessions.userId,
      sessionId: semanticEvalSessions.sessionId,
      startedAt: semanticEvalSessions.startedAt,
      endedAt: semanticEvalSessions.endedAt,
      messageCount: semanticEvalSessions.messageCount,
      avgUserRating: semanticEvalSessions.avgUserRating,
      avgAdminScore: semanticEvalSessions.avgAdminScore,
      status: semanticEvalSessions.status,
      lensId: semanticEvalSessions.lensId,
      metadata: semanticEvalSessions.metadata,
      createdAt: semanticEvalSessions.createdAt,
      // Aggregated turn metrics
      turnCount: sql<number>`count(${semanticEvalTurns.id})::int`.as('turn_count'),
      avgQuality: sql<string>`avg(${semanticEvalTurns.qualityScore})`.as('avg_quality'),
      avgRating: sql<string>`avg(${semanticEvalTurns.userRating})`.as('avg_rating'),
      clarificationCount: sql<number>`count(case when ${semanticEvalTurns.wasClarification} = true then 1 end)::int`.as('clarification_count'),
      errorCount: sql<number>`count(case when ${semanticEvalTurns.executionError} is not null then 1 end)::int`.as('error_count'),
      totalCost: sql<string>`coalesce(sum((coalesce(${semanticEvalTurns.llmTokensInput}, 0) + coalesce(${semanticEvalTurns.llmTokensOutput}, 0)) * 0.000003), 0)`.as('total_cost'),
    })
    .from(semanticEvalSessions)
    .leftJoin(
      semanticEvalTurns,
      eq(semanticEvalSessions.id, semanticEvalTurns.sessionId),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(semanticEvalSessions.id)
    .orderBy(desc(semanticEvalSessions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Map rows to match ConversationListResponse shape expected by frontend
  const conversations = items.map((row) => ({
    sessionId: row.sessionId ?? row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    userRole: (row.metadata as Record<string, unknown>)?.userRole as string ?? 'unknown',
    messageCount: row.messageCount ?? row.turnCount,
    avgQualityScore: row.avgQuality ? Number(row.avgQuality) : null,
    avgUserRating: row.avgRating ? Number(row.avgRating) : (row.avgUserRating ? Number(row.avgUserRating) : null),
    clarificationCount: row.clarificationCount,
    errorCount: row.errorCount,
    totalCostUsd: row.totalCost ? Number(row.totalCost) : null,
    startedAt: row.startedAt ?? row.createdAt,
    endedAt: row.endedAt,
  }));

  return NextResponse.json({
    data: {
      conversations,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    },
  });
});
