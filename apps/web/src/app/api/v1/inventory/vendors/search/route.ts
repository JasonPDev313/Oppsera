import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { searchVendors } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const results = await searchVendors(ctx.tenantId, query);
    return NextResponse.json({ data: results });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
