import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { listAdminLoginRecords, listLoginRecords } from '@oppsera/core/security';
import { parseUserAgent } from '@oppsera/shared';

export const GET = withAdminAuth(
  async (req) => {
    const url = new URL(req.url);
    const adminId = url.searchParams.get('adminId') ?? undefined;
    const userId = url.searchParams.get('userId') ?? undefined;
    const tenantId = url.searchParams.get('tenantId') ?? undefined;
    const outcome = url.searchParams.get('outcome') ?? undefined;
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;

    // If tenantId + userId supplied, query tenant login records (cross-tenant)
    if (tenantId && userId) {
      const result = await listLoginRecords({
        tenantId,
        userId,
        outcome: outcome as 'success' | 'failed' | 'locked' | undefined,
        from, to, cursor, limit,
      });

      const items = result.items.map((r) => {
        const ua = parseUserAgent(r.userAgent);
        return { ...r, createdAt: r.createdAt.toISOString(), browser: ua.browser, os: ua.os };
      });

      return NextResponse.json({
        data: items,
        meta: { cursor: result.cursor, hasMore: result.hasMore },
      });
    }

    // Otherwise query admin login records
    const result = await listAdminLoginRecords({
      adminId,
      email: url.searchParams.get('email') ?? undefined,
      outcome: outcome as 'success' | 'failed' | undefined,
      from, to, cursor, limit,
    });

    const items = result.items.map((r) => {
      const ua = parseUserAgent(r.userAgent);
      return { ...r, createdAt: r.createdAt.toISOString(), browser: ua.browser, os: ua.os };
    });

    return NextResponse.json({
      data: items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  'viewer',
);
