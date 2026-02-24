import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  invalidateGuestPaySession,
  invalidateGuestPaySessionSchema,
} from '@oppsera/module-fnb';
import { ValidationError } from '@oppsera/shared';

// POST /api/v1/fnb/guest-pay/sessions/:id/invalidate
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 2]!; // before /invalidate
    const body = await request.json().catch(() => ({}));
    const parsed = invalidateGuestPaySessionSchema.safeParse({
      sessionId: id,
      reason: body.reason,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await invalidateGuestPaySession(ctx, ctx.locationId ?? '', parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
