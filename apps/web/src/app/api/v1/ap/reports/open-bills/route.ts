import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOpenBills } from '@oppsera/module-ap';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getOpenBills({
      tenantId: ctx.tenantId,
      vendorId: searchParams.get('vendorId') ?? undefined,
      locationId: searchParams.get('locationId') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({
      data: result.items,
      meta: { totalBalance: result.totalBalance, cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
