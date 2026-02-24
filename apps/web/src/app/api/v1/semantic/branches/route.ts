import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticConversationBranches } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createBranchSchema = z.object({
  parentSessionId: z.string().min(1).max(128),
  parentTurnNumber: z.number().int().positive(),
  label: z.string().max(200).optional(),
});

// ── GET /api/v1/semantic/branches ─────────────────────────────────
// List conversation branches for a given session.
// Requires: ?sessionId=xxx

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      throw new ValidationError('Validation failed', [
        { field: 'sessionId', message: 'sessionId query parameter is required' },
      ]);
    }

    const rows = await db
      .select()
      .from(semanticConversationBranches)
      .where(
        and(
          eq(semanticConversationBranches.tenantId, ctx.tenantId),
          eq(semanticConversationBranches.userId, ctx.user.id),
          eq(semanticConversationBranches.parentSessionId, sessionId),
        ),
      )
      .orderBy(desc(semanticConversationBranches.createdAt));

    return NextResponse.json({
      data: rows.map((b) => ({
        id: b.id,
        parentSessionId: b.parentSessionId,
        parentTurnNumber: b.parentTurnNumber,
        branchSessionId: b.branchSessionId,
        label: b.label ?? null,
        createdAt: b.createdAt,
      })),
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/branches ────────────────────────────────
// Create a new conversation branch from a specific turn.
// Generates a new branchSessionId (ULID) for the forked thread.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createBranchSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { parentSessionId, parentTurnNumber, label } = parsed.data;

    // Generate a new session ID for the branch
    const branchSessionId = generateUlid();

    const [row] = await db
      .insert(semanticConversationBranches)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        parentSessionId,
        parentTurnNumber,
        branchSessionId,
        label: label ?? null,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        parentSessionId: row!.parentSessionId,
        parentTurnNumber: row!.parentTurnNumber,
        branchSessionId: row!.branchSessionId,
        label: row!.label ?? null,
        createdAt: row!.createdAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
