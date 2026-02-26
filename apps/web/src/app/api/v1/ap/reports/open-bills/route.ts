import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOpenBills } from '@oppsera/module-ap';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getOpenBills({
      tenantId: ctx.tenantId,
      vendorId: searchParams.get('vendorId') ?? undefined,
      locationId: searchParams.get('locationId') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.items,
      meta: { totalBalance: result.totalBalance, cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
