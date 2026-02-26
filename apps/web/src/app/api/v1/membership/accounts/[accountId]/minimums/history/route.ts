import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMinimumHistory } from '@oppsera/module-membership';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    const url = new URL(request.url);

    const result = await getMinimumHistory({
      tenantId: ctx.tenantId,
      customerId: accountId,
      ruleId: url.searchParams.get('ruleId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
