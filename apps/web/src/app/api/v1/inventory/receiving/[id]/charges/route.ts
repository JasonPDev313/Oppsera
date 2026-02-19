import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { addReceiptCharge, addReceiptChargeSchema } from '@oppsera/module-inventory';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/receiving/')[1]?.split('/')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing receipt ID' } }, { status: 400 });

    const body = await request.json();
    const input = addReceiptChargeSchema.parse({ ...body, receiptId: id });
    const charge = await addReceiptCharge(ctx, input);
    return NextResponse.json({ data: charge }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' },
);
