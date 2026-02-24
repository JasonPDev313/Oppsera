import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalReviewAssignments,
  semanticEvalTurns,
} from '@oppsera/db';
import { sql, and, eq, desc, count } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── GET: list review assignments with cursor pagination + filters ───────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const limit = Number(searchParams.get('limit') ?? '20');
  const cursor = searchParams.get('cursor');
  const assignedTo = searchParams.get('assignedTo');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');

  const conditions = [];
  if (cursor) conditions.push(sql`${semanticEvalReviewAssignments.id} < ${cursor}`);
  if (assignedTo) conditions.push(eq(semanticEvalReviewAssignments.assignedTo, assignedTo));
  if (status) conditions.push(eq(semanticEvalReviewAssignments.status, status));
  if (priority) conditions.push(eq(semanticEvalReviewAssignments.priority, priority));

  // Fetch assignments joined with turn data
  const rows = await db
    .select({
      id: semanticEvalReviewAssignments.id,
      evalTurnId: semanticEvalReviewAssignments.evalTurnId,
      assignedTo: semanticEvalReviewAssignments.assignedTo,
      assignedBy: semanticEvalReviewAssignments.assignedBy,
      priority: semanticEvalReviewAssignments.priority,
      status: semanticEvalReviewAssignments.status,
      dueAt: semanticEvalReviewAssignments.dueAt,
      completedAt: semanticEvalReviewAssignments.completedAt,
      createdAt: semanticEvalReviewAssignments.createdAt,
      // Turn data
      userMessage: semanticEvalTurns.userMessage,
      qualityScore: semanticEvalTurns.qualityScore,
      qualityFlags: semanticEvalTurns.qualityFlags,
    })
    .from(semanticEvalReviewAssignments)
    .leftJoin(
      semanticEvalTurns,
      eq(semanticEvalReviewAssignments.evalTurnId, semanticEvalTurns.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalReviewAssignments.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Compute stats by status
  const statsRows = await db
    .select({
      status: semanticEvalReviewAssignments.status,
      cnt: count(),
    })
    .from(semanticEvalReviewAssignments)
    .groupBy(semanticEvalReviewAssignments.status);

  const stats: Record<string, number> = {};
  for (const row of statsRows) {
    stats[row.status] = Number(row.cnt);
  }

  return NextResponse.json({
    data: items,
    meta: {
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
      stats,
    },
  });
});

// ── POST: assign reviews (admin only) ───────────────────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const { evalTurnIds, assignedTo, priority, dueAt } = body as {
      evalTurnIds: string[];
      assignedTo: string;
      priority?: string;
      dueAt?: string;
    };

    if (!evalTurnIds?.length || !assignedTo) {
      return NextResponse.json(
        { error: { message: 'evalTurnIds and assignedTo are required' } },
        { status: 400 },
      );
    }

    const now = new Date();
    const ids: string[] = [];

    const values = evalTurnIds.map((turnId) => {
      const id = generateUlid();
      ids.push(id);
      return {
        id,
        evalTurnId: turnId,
        assignedTo,
        assignedBy: session.adminId,
        priority: priority ?? 'normal',
        status: 'pending',
        dueAt: dueAt ? new Date(dueAt) : null,
        createdAt: now,
      };
    });

    await db.insert(semanticEvalReviewAssignments).values(values);

    return NextResponse.json(
      { data: { assigned: ids.length, ids } },
      { status: 201 },
    );
  },
  'admin',
);
