import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { reactivateVendor } from '@oppsera/module-inventory';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/vendors/')[1]?.split('/')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing vendor ID' } }, { status: 400 });

    const vendor = await reactivateVendor(ctx, id);
    return NextResponse.json({ data: vendor });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
