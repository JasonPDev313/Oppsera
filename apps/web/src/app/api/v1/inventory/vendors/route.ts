import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listVendors,
  createVendor,
  createVendorSchema,
} from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listVendors({
      tenantId: ctx.tenantId,
      search: url.searchParams.get('search') ?? undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : url.searchParams.get('isActive') === 'true' ? true : undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = createVendorSchema.parse(body);
    const vendor = await createVendor(ctx, input);
    return NextResponse.json({ data: vendor }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' },
);
