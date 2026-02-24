import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticSharedInsights, semanticEvalTurns } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createSharedInsightSchema = z.object({
  evalTurnId: z.string().min(1).max(128),
  title: z.string().min(1).max(200).optional(),
  accessLevel: z.enum(['tenant', 'specific_users']).default('tenant'),
  allowedUserIds: z.array(z.string()).max(50).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// ── POST /api/v1/semantic/shared ──────────────────────────────────
// Create a shareable insight link from an eval turn.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createSharedInsightSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { evalTurnId, title, accessLevel, allowedUserIds, expiresInDays } = parsed.data;

    // Fetch the eval turn to snapshot the insight data
    const [turn] = await db
      .select({
        id: semanticEvalTurns.id,
        tenantId: semanticEvalTurns.tenantId,
        sessionId: semanticEvalTurns.sessionId,
        userMessage: semanticEvalTurns.userMessage,
        narrative: semanticEvalTurns.narrative,
        responseSections: semanticEvalTurns.responseSections,
        resultSample: semanticEvalTurns.resultSample,
        rowCount: semanticEvalTurns.rowCount,
        compiledSql: semanticEvalTurns.compiledSql,
      })
      .from(semanticEvalTurns)
      .where(
        and(
          eq(semanticEvalTurns.id, evalTurnId),
          eq(semanticEvalTurns.tenantId, ctx.tenantId),
        ),
      );

    if (!turn) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Eval turn not found' } },
        { status: 404 },
      );
    }

    if (!turn.narrative) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Cannot share a turn without a narrative response' } },
        { status: 400 },
      );
    }

    // Generate a cryptographically secure share token (32 bytes = 256-bit entropy)
    const shareToken = randomBytes(32).toString('base64url');

    // Compute expiration if specified
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000)
      : null;

    const [row] = await db
      .insert(semanticSharedInsights)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        evalTurnId: turn.id,
        sessionId: turn.sessionId,
        title: title ?? null,
        userMessage: turn.userMessage,
        narrative: turn.narrative,
        sections: turn.responseSections ?? null,
        queryResult: turn.resultSample ?? null,
        shareToken,
        accessLevel,
        allowedUserIds: accessLevel === 'specific_users' ? (allowedUserIds ?? null) : null,
        expiresAt,
        createdBy: ctx.user.id,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        shareToken: row!.shareToken,
        accessLevel: row!.accessLevel,
        expiresAt: row!.expiresAt ?? null,
        createdAt: row!.createdAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
