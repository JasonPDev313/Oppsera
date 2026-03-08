import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, notInArray, ilike, or } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests } from '@oppsera/db';

// ── GET: find similar requests for dedup hints ───────────────────

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const module = url.searchParams.get('module');
    const title = url.searchParams.get('title');

    if (!module || !title) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Both module and title query params are required' } },
        { status: 400 },
      );
    }

    // Extract meaningful words from the title (> 2 chars)
    const words = title
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length > 2);

    if (words.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      // Build ilike conditions for each word
      const wordConditions = words.map((word) =>
        ilike(featureRequests.title, `%${word}%`),
      );

      return tx
        .select({
          id: featureRequests.id,
          title: featureRequests.title,
          requestType: featureRequests.requestType,
          status: featureRequests.status,
          voteCount: featureRequests.voteCount,
        })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.tenantId, ctx.tenantId),
            eq(featureRequests.module, module),
            notInArray(featureRequests.status, ['completed', 'declined']),
            or(...wordConditions),
          ),
        )
        .limit(5);
    });

    const data = Array.from(rows as Iterable<(typeof rows)[number]>);

    return NextResponse.json({ data });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
