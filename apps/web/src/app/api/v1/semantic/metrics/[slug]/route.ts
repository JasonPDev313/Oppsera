import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticMetrics } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

// ── Helper ────────────────────────────────────────────────────────

function extractSlug(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── DELETE /api/v1/semantic/metrics/[slug] ────────────────────────
// Delete a custom tenant metric. System metrics cannot be deleted.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const slug = extractSlug(request);

    const [row] = await db
      .delete(semanticMetrics)
      .where(
        and(
          eq(semanticMetrics.slug, slug),
          eq(semanticMetrics.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Custom metric', slug);
    }

    return NextResponse.json({ data: { slug: row.slug, deleted: true } });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
