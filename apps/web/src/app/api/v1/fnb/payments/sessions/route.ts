import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  startPaymentSession,
  listPaymentSessions,
  startPaymentSessionSchema,
  listPaymentSessionsSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/payments/sessions — list payment sessions for a tab
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listPaymentSessionsSchema.safeParse({
      tenantId: ctx.tenantId,
      tabId: url.searchParams.get('tabId') ?? '',
      status: url.searchParams.get('status') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listPaymentSessions(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);

// POST /api/v1/fnb/payments/sessions — start a new payment session
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = startPaymentSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await startPaymentSession(ctx, ctx.locationId ?? '', parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage' , writeAccess: true },
);
