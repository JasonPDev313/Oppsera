import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updatePaymentTerms, updatePaymentTermsSchema } from '@oppsera/module-ap';

// PUT /api/v1/ap/payment-terms/:id — update payment terms
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updatePaymentTermsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updatePaymentTerms(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' },
);
