import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  updateReceiptLine,
  updateReceiptLineSchema,
  removeReceiptLine,
} from '@oppsera/module-inventory';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.url.split('/lines/');
    const lineId = parts[1]?.split('/')[0]?.split('?')[0];
    if (!lineId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing line ID' } }, { status: 400 });

    const body = await request.json();
    const input = updateReceiptLineSchema.parse({ ...body, lineId });
    const result = await updateReceiptLine(ctx, input);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.url.split('/lines/');
    const lineId = parts[1]?.split('/')[0]?.split('?')[0];
    if (!lineId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing line ID' } }, { status: 400 });

    await removeReceiptLine(ctx, lineId);
    return NextResponse.json({ data: { deleted: true } });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
