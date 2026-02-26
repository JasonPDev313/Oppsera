import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getPaymentHistory, createPayment, createPaymentSchema } from '@oppsera/module-ap';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getPaymentHistory({
      tenantId: ctx.tenantId,
      vendorId: searchParams.get('vendorId') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      paymentMethod: searchParams.get('paymentMethod') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createPayment(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'ap', permission: 'ap.manage' , writeAccess: true },
);
