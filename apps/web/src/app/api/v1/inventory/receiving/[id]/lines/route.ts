import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { addReceiptLine, addReceiptLineSchema } from '@oppsera/module-inventory';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = request.url.split('/receiving/')[1]?.split('/')[0];
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing receipt ID' } }, { status: 400 });

    const body = await request.json();
    const parsed = addReceiptLineSchema.safeParse({ ...body, receiptId: id });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }
    const line = await addReceiptLine(ctx, parsed.data);
    return NextResponse.json({ data: line }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
