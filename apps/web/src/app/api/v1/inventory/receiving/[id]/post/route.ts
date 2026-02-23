import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postReceipt } from '@oppsera/module-inventory';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/receiving/')[1]?.split('/')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing receipt ID' } }, { status: 400 });

    const receipt = await postReceipt(ctx, { receiptId: id });
    return NextResponse.json({ data: receipt });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
