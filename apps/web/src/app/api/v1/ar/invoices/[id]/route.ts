import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getInvoice } from '@oppsera/module-ar';
import { NotFoundError } from '@oppsera/shared';

// GET /api/v1/ar/invoices/:id — get invoice detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const result = await getInvoice({ tenantId: ctx.tenantId, invoiceId: id });
    if (!result) {
      throw new NotFoundError('Invoice', id);
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.view' },
);
