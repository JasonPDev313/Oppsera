import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAnalysisFindings } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractFindingId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateFindingSchema = z.object({
  isRead: z.boolean().optional(),
  isDismissed: z.boolean().optional(),
});

// ── PATCH /api/v1/semantic/findings/[id] ──────────────────────────
// Mark a finding as read or dismissed.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractFindingId(request);
    const body = await request.json();
    const parsed = updateFindingSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.isRead !== undefined) {
      updates.isRead = data.isRead;
      updates.readAt = data.isRead ? new Date() : null;
    }
    if (data.isDismissed !== undefined) {
      updates.isDismissed = data.isDismissed;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('Validation failed', [
        { field: 'body', message: 'At least one field (isRead, isDismissed) is required' },
      ]);
    }

    const [row] = await db
      .update(semanticAnalysisFindings)
      .set(updates)
      .where(
        and(
          eq(semanticAnalysisFindings.id, id),
          eq(semanticAnalysisFindings.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Finding not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        isRead: row.isRead,
        readAt: row.readAt ?? null,
        isDismissed: row.isDismissed,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
