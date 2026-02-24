import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalSessions,
  semanticEvalTurns,
} from '@oppsera/db';
import { eq, asc } from 'drizzle-orm';

// ── GET: get session detail with all turns + quality trend ──────────────

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    // Fetch the session
    const [evalSession] = await db
      .select()
      .from(semanticEvalSessions)
      .where(eq(semanticEvalSessions.id, id))
      .limit(1);

    if (!evalSession) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    // Fetch all turns ordered by turnNumber
    const turns = await db
      .select()
      .from(semanticEvalTurns)
      .where(eq(semanticEvalTurns.sessionId, id))
      .orderBy(asc(semanticEvalTurns.turnNumber));

    // Compute quality trend from turns
    const qualityTrend = turns
      .filter((t) => t.qualityScore !== null)
      .map((t) => ({
        turnNumber: t.turnNumber,
        qualityScore: Number(t.qualityScore),
        userRating: t.userRating,
        wasClarification: t.wasClarification,
        executionTimeMs: t.executionTimeMs,
      }));

    return NextResponse.json({
      data: {
        session: evalSession,
        turns,
        qualityTrend,
      },
    });
  },
);
