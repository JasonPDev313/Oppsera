import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { voidInvoice } from '@oppsera/module-ar';

function extractInvoiceId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/ar/invoices/:id/void — void an invoice
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const invoiceId = extractInvoiceId(request);
    const body = await request.json();
    if (!body.reason || typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'reason is required' } },
        { status: 400 },
      );
    }
    const result = await voidInvoice(ctx, { invoiceId, reason: body.reason.trim() });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.manage' , writeAccess: true },
);
