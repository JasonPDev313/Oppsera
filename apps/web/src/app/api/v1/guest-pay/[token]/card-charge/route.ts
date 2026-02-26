import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getGuestPaySessionByToken } from '@oppsera/module-fnb';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

// ── Zod schema for card-charge request body ─────────────────
const cardChargeSchema = z.object({
  token: z.string().min(1, 'Card token is required').max(500),
  tipAmountCents: z.coerce.number().int().min(0).max(999_999).default(0),
  expiry: z.string().max(10).optional(),
});

/**
 * POST /api/v1/guest-pay/:token/card-charge
 *
 * Process a real card payment for guest pay-at-table using a CardSecure token
 * from the hosted iFrame tokenizer.
 *
 * Body: { token: string; tipAmountCents?: number; expiry?: string }
 *
 * Flow:
 * 1. Validate session is active
 * 2. Call PaymentsGatewayApi.sale() with ecomind 'E' (e-commerce)
 * 3. Record payment attempt in guest_pay_payment_attempts
 * 4. Mark session as paid
 * 5. Return result
 */
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/guest-pay/{token}/card-charge
    const token = segments[segments.length - 2]!;

    const body = await request.json();
    const parsed = cardChargeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input', details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }
    const { token: cardToken, tipAmountCents } = parsed.data;

    // 1. Look up session by token
    const session = await getGuestPaySessionByToken(token);
    if (!session) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } },
        { status: 404 },
      );
    }
    if (session.status === 'expired' || session.status === 'invalidated' || session.status === 'superseded') {
      return NextResponse.json(
        { error: { code: 'SESSION_EXPIRED', message: 'This payment session has expired' } },
        { status: 410 },
      );
    }
    if (session.status === 'paid') {
      return NextResponse.json(
        { error: { code: 'ALREADY_PAID', message: 'This check has already been paid' } },
        { status: 409 },
      );
    }
    if (session.status !== 'active') {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_ACTIVE', message: 'This payment session is not active' } },
        { status: 409 },
      );
    }

    // 2. Verify gateway is configured
    if (!hasPaymentsGateway()) {
      throw new AppError('GATEWAY_NOT_CONFIGURED', 'Card payments are not configured', 503);
    }

    // 3. Calculate charge amount
    const chargeAmountCents = session.totalCents + tipAmountCents;
    if (chargeAmountCents <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Charge amount must be greater than zero', 400);
    }

    // 4. Build a synthetic context for the gateway call
    // Guest pay sessions have tenantId and locationId from the session
    const sessionId = session.id;
    const clientRequestId = `guest-pay-${sessionId}-${Date.now()}`;

    // Use a minimal context for gateway — guest pay is unauthenticated
    const ctx = {
      tenantId: '', // Will be resolved from session
      locationId: '', // Will be resolved from session
      user: { id: 'guest', email: 'guest@pay', name: 'Guest' },
      requestId: clientRequestId,
    };

    // Look up actual tenant/location from the session (we need the raw DB row)
    const sessionRows = await db.execute(
      sql`SELECT tenant_id, location_id FROM guest_pay_sessions WHERE id = ${sessionId}`,
    );
    const sessionRow = Array.from(sessionRows as Iterable<Record<string, unknown>>)[0];
    if (!sessionRow) {
      throw new AppError('SESSION_NOT_FOUND', 'Session data not found', 404);
    }

    ctx.tenantId = sessionRow.tenant_id as string;
    ctx.locationId = sessionRow.location_id as string;

    // 5. Process card payment via gateway
    let gatewayResult;
    try {
      const gateway = getPaymentsGatewayApi();
      gatewayResult = await gateway.sale(ctx as any, {
        amountCents: chargeAmountCents,
        token: cardToken.trim(),
        tipCents: tipAmountCents > 0 ? tipAmountCents : undefined,
        ecomind: 'E', // E-commerce (guest-facing web form)
        metadata: { source: 'guest_pay', sessionId },
        clientRequestId,
      });
    } catch (err) {
      // Record failed attempt
      await recordPaymentAttempt(sessionId, 'error', null, err instanceof Error ? err.message : 'Gateway error');

      throw new AppError(
        'PAYMENT_PROCESSING_ERROR',
        'Unable to process card payment. Please try again.',
        502,
      );
    }

    // 6. Check result
    if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
      await recordPaymentAttempt(sessionId, 'declined', gatewayResult.providerRef ?? null, gatewayResult.errorMessage ?? 'Card declined');

      return NextResponse.json(
        { error: { code: 'PAYMENT_DECLINED', message: gatewayResult.errorMessage ?? 'Card payment was declined. Please try a different card.' } },
        { status: 402 },
      );
    }

    // 7. Payment succeeded — record attempt and update session
    await recordPaymentAttempt(sessionId, 'approved', gatewayResult.providerRef ?? null, null);

    // Update session to paid
    await db.execute(
      sql`UPDATE guest_pay_sessions
          SET status = 'paid',
              paid_at = NOW(),
              tip_cents = ${tipAmountCents},
              updated_at = NOW()
          WHERE id = ${sessionId} AND status = 'active'`,
    );

    // 8. Return success with card details
    return NextResponse.json({
      data: {
        status: 'paid',
        transactionRef: gatewayResult.providerRef ?? gatewayResult.id,
        cardLast4: gatewayResult.cardLast4 ?? null,
        cardBrand: gatewayResult.cardBrand ?? null,
        chargedAmountCents: chargeAmountCents,
        tipAmountCents,
      },
    });
  },
  { public: true },
);

/**
 * Record a payment attempt in the audit table.
 */
async function recordPaymentAttempt(
  sessionId: string,
  status: string,
  providerRef: string | null,
  errorMessage: string | null,
) {
  try {
    await db.execute(
      sql`INSERT INTO guest_pay_payment_attempts (
            id, session_id, payment_method, status, provider_ref, error_message, created_at
          ) VALUES (
            gen_random_uuid()::text, ${sessionId}, 'card', ${status},
            ${providerRef}, ${errorMessage}, NOW()
          )`,
    );
  } catch {
    // Best-effort — don't block payment result on audit logging
    console.error(`Failed to record payment attempt for session ${sessionId}`);
  }
}
