import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listLoginRecords } from '@oppsera/core/security';
import { parseUserAgent } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request, ctx) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') ?? undefined;
    const outcome = url.searchParams.get('outcome') as 'success' | 'failed' | 'locked' | undefined;
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;

    const result = await listLoginRecords({
      tenantId: ctx.tenantId,
      userId,
      outcome: outcome && ['success', 'failed', 'locked'].includes(outcome) ? outcome : undefined,
      from,
      to,
      cursor,
      limit,
    });

    // Enrich with parsed user-agent
    const items = result.items.map((r) => {
      const ua = parseUserAgent(r.userAgent);
      return {
        ...r,
        createdAt: r.createdAt.toISOString(),
        browser: ua.browser,
        os: ua.os,
      };
    });

    return NextResponse.json({
      data: items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);
