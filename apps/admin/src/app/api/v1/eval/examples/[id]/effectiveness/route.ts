import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalExamples,
  semanticEvalTurns,
} from '@oppsera/db';
import { eq, sql } from 'drizzle-orm';

// ── GET: effectiveness stats for an example ─────────────────────────────
// Approximates usage by querying eval turns that match the example's question pattern.

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    // Fetch the example
    const [example] = await db
      .select({
        id: semanticEvalExamples.id,
        question: semanticEvalExamples.question,
        category: semanticEvalExamples.category,
        createdAt: semanticEvalExamples.createdAt,
      })
      .from(semanticEvalExamples)
      .where(eq(semanticEvalExamples.id, id))
      .limit(1);

    if (!example) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    // Query eval turns matching this example's question pattern
    // Use case-insensitive LIKE with key words from the question
    const questionWords = example.question
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    // Build a pattern that matches turns containing the key words
    // This is an approximation -- full-text search would be more accurate
    const matchConditions = questionWords.map(
      (word) => sql`lower(${semanticEvalTurns.userMessage}) like ${'%' + word + '%'}`,
    );

    const statsQuery = matchConditions.length > 0
      ? sql`
          select
            count(*)::int as total_matches,
            avg(${semanticEvalTurns.userRating})::numeric(3,2) as avg_rating,
            avg(${semanticEvalTurns.qualityScore})::numeric(3,2) as avg_quality,
            avg(${semanticEvalTurns.executionTimeMs})::int as avg_execution_ms,
            count(case when ${semanticEvalTurns.adminVerdict} = 'correct' then 1 end)::int as correct_count,
            count(case when ${semanticEvalTurns.adminVerdict} = 'incorrect' then 1 end)::int as incorrect_count,
            count(case when ${semanticEvalTurns.adminVerdict} = 'hallucination' then 1 end)::int as hallucination_count,
            count(case when ${semanticEvalTurns.wasClarification} = true then 1 end)::int as clarification_count,
            min(${semanticEvalTurns.createdAt}) as first_seen,
            max(${semanticEvalTurns.createdAt}) as last_seen
          from ${semanticEvalTurns}
          where ${sql.join(matchConditions, sql` and `)}
        `
      : null;

    if (!statsQuery) {
      return NextResponse.json({
        data: {
          exampleId: id,
          question: example.question,
          category: example.category,
          stats: null,
          message: 'Could not extract meaningful search terms from question',
        },
      });
    }

    const result = await db.execute(statsQuery);
    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    const stats = rows[0] ?? null;

    return NextResponse.json({
      data: {
        exampleId: id,
        question: example.question,
        category: example.category,
        stats: stats
          ? {
              totalMatches: stats.total_matches,
              avgRating: stats.avg_rating ? Number(stats.avg_rating) : null,
              avgQuality: stats.avg_quality ? Number(stats.avg_quality) : null,
              avgExecutionMs: stats.avg_execution_ms,
              correctCount: stats.correct_count,
              incorrectCount: stats.incorrect_count,
              hallucinationCount: stats.hallucination_count,
              clarificationCount: stats.clarification_count,
              firstSeen: stats.first_seen,
              lastSeen: stats.last_seen,
            }
          : null,
      },
    });
  },
);
