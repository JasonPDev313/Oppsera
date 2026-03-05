import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceipt, updateDraftReceipt, updateReceiptSchema } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/receiving/')[1]?.split('/')[0]?.split('?')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing receipt ID' } }, { status: 400 });

    const receipt = await getReceipt(ctx.tenantId, id);
    if (!receipt) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Receipt not found' } }, { status: 404 });
    }
    return NextResponse.json({ data: receipt });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/receiving/')[1]?.split('/')[0]?.split('?')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing receipt ID' } }, { status: 400 });

    const body = await request.json();
    const parsed = updateReceiptSchema.safeParse({ ...body, receiptId: id });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }
    const receipt = await updateDraftReceipt(ctx, parsed.data);
    return NextResponse.json({ data: receipt });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
