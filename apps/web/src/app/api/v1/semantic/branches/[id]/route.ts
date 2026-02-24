import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticConversationBranches } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateBranchSchema = z.object({
  label: z.string().max(200).nullable(),
});

// ── PATCH /api/v1/semantic/branches/[id] ──────────────────────────
// Update a branch's label.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateBranchSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // semanticConversationBranches doesn't have updatedAt, just update the label
    const [row] = await db
      .update(semanticConversationBranches)
      .set({ label: parsed.data.label })
      .where(
        and(
          eq(semanticConversationBranches.id, id),
          eq(semanticConversationBranches.tenantId, ctx.tenantId),
          eq(semanticConversationBranches.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Branch not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        parentSessionId: row.parentSessionId,
        parentTurnNumber: row.parentTurnNumber,
        branchSessionId: row.branchSessionId,
        label: row.label ?? null,
        createdAt: row.createdAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);

// ── DELETE /api/v1/semantic/branches/[id] ─────────────────────────
// Delete a conversation branch. Hard delete since branches are
// user-scoped pointers.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const [row] = await db
      .delete(semanticConversationBranches)
      .where(
        and(
          eq(semanticConversationBranches.id, id),
          eq(semanticConversationBranches.tenantId, ctx.tenantId),
          eq(semanticConversationBranches.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Branch not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
