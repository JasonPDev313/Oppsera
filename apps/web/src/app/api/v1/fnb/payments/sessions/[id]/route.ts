import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getPaymentSession, getPaymentSessionSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/payments/sessions/[id] — get payment session detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const sessionId = parts[parts.length - 1]!;

    const parsed = getPaymentSessionSchema.safeParse({
      tenantId: ctx.tenantId,
      sessionId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await getPaymentSession(parsed.data);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Payment session not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);
