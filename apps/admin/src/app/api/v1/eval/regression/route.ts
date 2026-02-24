import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalRegressionRuns,
  semanticEvalExamples,
} from '@oppsera/db';
import { sql, and, desc, eq, count } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── GET: list regression runs with cursor pagination ────────────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const limit = Number(searchParams.get('limit') ?? '20');
  const cursor = searchParams.get('cursor');

  const conditions = [];
  if (cursor) conditions.push(sql`${semanticEvalRegressionRuns.id} < ${cursor}`);

  const rows = await db
    .select()
    .from(semanticEvalRegressionRuns)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalRegressionRuns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items,
    meta: {
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    },
  });
});

// ── POST: create a new regression run (admin only) ──────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const { name, categoryFilter } = body as {
      name?: string;
      categoryFilter?: string;
    };

    // Count matching examples
    const exampleConditions = [eq(semanticEvalExamples.isActive, true)];
    if (categoryFilter) {
      exampleConditions.push(eq(semanticEvalExamples.category, categoryFilter));
    }

    const countResult = await db
      .select({ value: count() })
      .from(semanticEvalExamples)
      .where(and(...exampleConditions));
    const exampleCount = countResult[0]?.value ?? 0;

    const id = generateUlid();
    const now = new Date();

    await db.insert(semanticEvalRegressionRuns).values({
      id,
      name: name ?? `Regression Run ${now.toISOString().slice(0, 10)}`,
      status: 'pending',
      triggerType: 'manual',
      exampleCount: Number(exampleCount),
      totalExamples: Number(exampleCount),
      categoryFilter: categoryFilter ?? null,
      createdBy: session.adminId,
      createdAt: now,
    });

    return NextResponse.json({ data: { id, exampleCount: Number(exampleCount) } }, { status: 201 });
  },
  'admin',
);
