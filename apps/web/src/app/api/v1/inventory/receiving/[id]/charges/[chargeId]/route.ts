import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  updateReceiptCharge,
  removeReceiptCharge,
  updateReceiptChargeSchema,
  removeReceiptChargeSchema,
} from '@oppsera/module-inventory';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const urlParts = request.url.split('/charges/');
    const chargeId = urlParts[1]?.split('?')[0];
    if (!chargeId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing charge ID' } }, { status: 400 });

    const body = await request.json();
    const input = updateReceiptChargeSchema.parse({ ...body, chargeId });
    const charge = await updateReceiptCharge(ctx, input);
    return NextResponse.json({ data: charge });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const urlParts = request.url.split('/charges/');
    const chargeId = urlParts[1]?.split('?')[0];
    if (!chargeId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing charge ID' } }, { status: 400 });

    const input = removeReceiptChargeSchema.parse({ chargeId });
    await removeReceiptCharge(ctx, input);
    return NextResponse.json({ data: { chargeId } });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
