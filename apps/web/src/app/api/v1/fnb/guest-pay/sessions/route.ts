import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import {
  createGuestPaySession,
  createGuestPaySessionSchema,
} from '@oppsera/module-fnb';

// POST /api/v1/fnb/guest-pay/sessions — create guest pay session
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = createGuestPaySessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createGuestPaySession(ctx, ctx.locationId ?? '', parsed.data);
    broadcastFnb(ctx, 'guest_pay', 'tabs').catch(() => {});
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
