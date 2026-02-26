import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listLoyaltyTransactions, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // .../loyalty/members/[id]/transactions -> id is segments[length-2]
    const memberId = segments[segments.length - 2]!;

    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const result = await listLoyaltyTransactions(ctx.tenantId, memberId, cursor, limit);
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.LOYALTY_VIEW },
);
