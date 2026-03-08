import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { ValidationError } from '@oppsera/shared';
import { verifyManagerPin, verifyManagerPinSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/manage/verify-pin
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Rate limit: 5 attempts per minute per tenant
    const rlKey = getRateLimitKey(request, `fnb-verify-pin:${ctx.tenantId}`);
    const rl = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many PIN attempts. Please wait.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const parsed = verifyManagerPinSchema.safeParse({
      ...body,
      tenantId: ctx.tenantId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await verifyManagerPin(ctx.tenantId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.view' },
);
