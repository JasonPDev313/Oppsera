import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError, AppError } from '@oppsera/shared';
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
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create' },
);

// POST /api/v1/fnb/payments/sessions — start a new payment session
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = startPaymentSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const result = await startPaymentSession(ctx, ctx.locationId, parsed.data);
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
