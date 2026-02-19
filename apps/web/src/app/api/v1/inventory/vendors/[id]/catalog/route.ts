import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getVendorCatalog,
  addVendorCatalogItem,
  addVendorCatalogItemSchema,
} from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/vendors/')[1]?.split('/')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing vendor ID' } }, { status: 400 });

    const url = new URL(request.url);
    const result = await getVendorCatalog({
      tenantId: ctx.tenantId,
      vendorId: id,
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
    const id = request.url.split('/vendors/')[1]?.split('/')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing vendor ID' } }, { status: 400 });

    const body = await request.json();
    const input = addVendorCatalogItemSchema.parse({ ...body, vendorId: id });
    const item = await addVendorCatalogItem(ctx, input);
    return NextResponse.json({ data: item }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' },
);
