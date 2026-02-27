import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticPinnedMetrics } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(100),
});

// ── PATCH /api/v1/semantic/pinned-metrics/reorder ─────────────────
// Batch-update sortOrder for all pinned metrics based on array position.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { orderedIds } = parsed.data;

    await db.transaction(async (tx) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          tx
            .update(semanticPinnedMetrics)
            .set({ sortOrder: idx, updatedAt: new Date() })
            .where(
              and(
                eq(semanticPinnedMetrics.id, id),
                eq(semanticPinnedMetrics.tenantId, ctx.tenantId),
                eq(semanticPinnedMetrics.userId, ctx.user.id),
              ),
            ),
        ),
      );
    });

    return NextResponse.json({ data: { reordered: orderedIds.length } });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
