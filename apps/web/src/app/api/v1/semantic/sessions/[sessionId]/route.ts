import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEvalSession } from '@oppsera/module-semantic/evaluation';

// GET /api/v1/semantic/sessions/:sessionId
// Returns session metadata + all turns for reconstructing a chat conversation.

function extractSessionId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const sessionId = extractSessionId(request);

    const result = await getEvalSession(sessionId, ctx.tenantId);

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Session not found' } },
        { status: 404 },
      );
    }

    // Return subset of turn fields needed for chat reconstruction
    const turns = result.turns.map((turn) => ({
      id: turn.id,
      turnNumber: turn.turnNumber,
      userMessage: turn.userMessage,
      narrative: turn.narrative,
      llmPlan: turn.llmPlan,
      compiledSql: turn.compiledSql,
      compilationErrors: turn.compilationErrors,
      resultSample: turn.resultSample,
      rowCount: turn.rowCount,
      cacheStatus: turn.cacheStatus,
      llmConfidence: turn.llmConfidence,
      llmLatencyMs: turn.llmLatencyMs,
      wasClarification: turn.wasClarification,
      clarificationMessage: turn.clarificationMessage,
      userRating: turn.userRating,
      userThumbsUp: turn.userThumbsUp,
      evalTurnId: turn.id,
      createdAt: turn.createdAt,
    }));

    return NextResponse.json({
      data: {
        session: {
          id: result.session.id,
          sessionId: result.session.sessionId,
          startedAt: result.session.startedAt,
          endedAt: result.session.endedAt,
          messageCount: result.session.messageCount,
          avgUserRating: result.session.avgUserRating,
          status: result.session.status,
        },
        turns,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.query' },
);
