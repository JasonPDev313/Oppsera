import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { getGiftCardBalance } from '@oppsera/module-payments';

async function handler(req: NextRequest, ctx: { tenantId: string }) {
  const url = new URL(req.url);
  const cardNumber = url.searchParams.get('cardNumber');
  if (!cardNumber) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'cardNumber query parameter is required' } },
      { status: 400 },
    );
  }

  const result = await getGiftCardBalance(ctx.tenantId, cardNumber);

  if (!result) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Gift card not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, {
  entitlement: 'payments',
  permission: 'tenders.view',
});
