import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listPaymentTerms,
  createPaymentTerms,
  createPaymentTermsSchema,
} from '@oppsera/module-ap';

// GET /api/v1/ap/payment-terms — list payment terms
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('isActive');
    const result = await listPaymentTerms({
      tenantId: ctx.tenantId,
      isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);

// POST /api/v1/ap/payment-terms — create payment terms
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPaymentTermsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createPaymentTerms(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'ap', permission: 'ap.manage' , writeAccess: true },
);
