import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, sql, semanticSharedInsights } from '@oppsera/db';

// ── Helpers ───────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── GET /api/v1/semantic/shared/[token] ───────────────────────────
// View a shared insight. Public within tenant — no write permission needed.
// Increments view count atomically. Validates expiration and access level.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const token = decodeURIComponent(extractToken(request));

    // Fetch the shared insight by token within this tenant
    const [insight] = await db
      .select()
      .from(semanticSharedInsights)
      .where(
        and(
          eq(semanticSharedInsights.shareToken, token),
          eq(semanticSharedInsights.tenantId, ctx.tenantId),
        ),
      );

    if (!insight) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Shared insight not found' } },
        { status: 404 },
      );
    }

    // Check expiration
    if (insight.expiresAt && new Date(insight.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: { code: 'EXPIRED', message: 'This shared insight has expired' } },
        { status: 410 },
      );
    }

    // Check access level
    if (insight.accessLevel === 'specific_users') {
      const allowedIds = insight.allowedUserIds ?? [];
      if (!allowedIds.includes(ctx.user.id) && insight.createdBy !== ctx.user.id) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have access to this shared insight' } },
          { status: 403 },
        );
      }
    }

    // Increment view count atomically
    await db
      .update(semanticSharedInsights)
      .set({
        viewCount: sql`${semanticSharedInsights.viewCount} + 1`,
      })
      .where(eq(semanticSharedInsights.id, insight.id));

    return NextResponse.json({
      data: {
        id: insight.id,
        title: insight.title ?? null,
        userMessage: insight.userMessage,
        narrative: insight.narrative,
        sections: insight.sections ?? null,
        queryResult: insight.queryResult ?? null,
        chartConfig: insight.chartConfig ?? null,
        mode: insight.mode ?? null,
        accessLevel: insight.accessLevel,
        viewCount: insight.viewCount + 1,
        createdBy: insight.createdBy,
        createdAt: insight.createdAt,
        expiresAt: insight.expiresAt ?? null,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
