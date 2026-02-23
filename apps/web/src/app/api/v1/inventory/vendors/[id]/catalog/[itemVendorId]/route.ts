import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  updateVendorCatalogItem,
  updateVendorCatalogItemSchema,
  deactivateVendorCatalogItem,
} from '@oppsera/module-inventory';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.url.split('/catalog/');
    const itemVendorId = parts[1]?.split('/')[0]?.split('?')[0];
    if (!itemVendorId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing item vendor ID' } }, { status: 400 });

    const body = await request.json();
    const input = updateVendorCatalogItemSchema.parse({ ...body, itemVendorId });
    const item = await updateVendorCatalogItem(ctx, input);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.url.split('/catalog/');
    const itemVendorId = parts[1]?.split('/')[0]?.split('?')[0];
    if (!itemVendorId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing item vendor ID' } }, { status: 400 });

    await deactivateVendorCatalogItem(ctx, itemVendorId);
    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
