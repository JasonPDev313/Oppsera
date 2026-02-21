import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postInvoice } from '@oppsera/module-ar';

function extractInvoiceId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // .../invoices/:id/post → id is at index parts.length - 2
  return parts[parts.length - 2]!;
}

// POST /api/v1/ar/invoices/:id/post — post an invoice
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const invoiceId = extractInvoiceId(request);
    const result = await postInvoice(ctx, { invoiceId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.manage' },
);
