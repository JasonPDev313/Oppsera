import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listInvoices, createInvoice, createInvoiceSchema } from '@oppsera/module-ar';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/ar/invoices — list invoices
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await listInvoices({
      tenantId: ctx.tenantId,
      customerId: searchParams.get('customerId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'ar', permission: 'ar.view' },
);

// POST /api/v1/ar/invoices — create an invoice
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createInvoice(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'ar', permission: 'ar.manage' , writeAccess: true },
);
