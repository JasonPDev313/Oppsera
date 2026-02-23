import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getVendor, updateVendor, updateVendorSchema } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/vendors/')[1]?.split('/')[0]?.split('?')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing vendor ID' } }, { status: 400 });

    const vendor = await getVendor(ctx.tenantId, id);
    if (!vendor) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }, { status: 404 });
    }
    return NextResponse.json({ data: vendor });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/vendors/')[1]?.split('/')[0]?.split('?')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing vendor ID' } }, { status: 400 });

    const body = await request.json();
    const input = updateVendorSchema.parse({ ...body, vendorId: id });
    const vendor = await updateVendor(ctx, input);
    return NextResponse.json({ data: vendor });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
