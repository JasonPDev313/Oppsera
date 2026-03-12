import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { AppError, ValidationError } from '@oppsera/shared';
import { quickCashPayment, quickCashPaymentSchema } from '@oppsera/module-fnb';

/**
 * POST /api/v1/fnb/payments/quick-cash — single-trip exact cash payment
 *
 * Combines start-session + record-tender + complete-session into one DB transaction.
 * Event dispatch is deferred via after() so the response returns immediately.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }

    const parsed = quickCashPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const { result, dispatchEvents } = await quickCashPayment(
      ctx, ctx.locationId, parsed.data, { deferDispatch: true },
    );

    // Dispatch events + broadcast AFTER the response is sent.
    // Events are durable in the outbox — the outbox worker is the safety net.
    after(async () => {
      await dispatchEvents();
      broadcastFnb(ctx, 'tabs').catch(() => {});
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
