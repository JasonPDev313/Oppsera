import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError, AppError } from '@oppsera/shared';
import {
  completePaymentSession,
  completePaymentSessionSchema,
  failPaymentSession,
  failPaymentSessionSchema,
  voidLastTender,
  voidLastTenderSchema,
} from '@oppsera/module-fnb';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

const ACTIONS: Record<string, true> = {
  complete: true,
  fail: true,
  'void-last-tender': true,
};

function extractSessionId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/fnb/payments/sessions/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }

    switch (action) {
      case 'complete': {
        const body = await request.json();
        const parsed = completePaymentSessionSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await completePaymentSession(ctx, ctx.locationId, parsed.data);
        broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
        return NextResponse.json({ data: result });
      }

      case 'fail': {
        const body = await request.json();
        const parsed = failPaymentSessionSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await failPaymentSession(ctx, ctx.locationId, parsed.data);
        broadcastFnb(ctx, 'tabs').catch(() => {});
        return NextResponse.json({ data: result });
      }

      case 'void-last-tender': {
        const rawSessionId = extractSessionId(request);
        const parsed = voidLastTenderSchema.safeParse({ sessionId: rawSessionId });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const { sessionId } = parsed.data;

        // If gateway is configured, void/refund the last card intent BEFORE updating amounts
        if (hasPaymentsGateway()) {
          const lastIntent = await withTenant(ctx.tenantId, async (tx) => {
            const rows = await tx.execute(
              sql`SELECT id, status FROM payment_intents
                  WHERE tenant_id = ${ctx.tenantId}
                    AND metadata->>'sessionId' = ${sessionId}
                    AND status IN ('authorized', 'captured')
                  ORDER BY created_at DESC
                  LIMIT 1`,
            );
            const result = Array.from(rows as Iterable<Record<string, unknown>>);
            return result[0] ?? null;
          });

          if (lastIntent?.id) {
            const gateway = getPaymentsGatewayApi();
            try {
              await gateway.void(ctx, {
                paymentIntentId: lastIntent.id as string,
                clientRequestId: `void-tender-${sessionId}-${Date.now()}`,
              });
            } catch {
              // If void fails (already settled), try refund
              try {
                await gateway.refund(ctx, {
                  paymentIntentId: lastIntent.id as string,
                  clientRequestId: `refund-tender-${sessionId}-${Date.now()}`,
                });
              } catch (refundErr) {
                console.error('Failed to void/refund gateway payment:', refundErr);
                throw new AppError(
                  'VOID_FAILED',
                  'Failed to void the card payment on the gateway',
                  502,
                );
              }
            }
          }
        }

        // Now reverse the session amounts (transactional, with FOR UPDATE)
        const result = await voidLastTender(ctx, ctx.locationId, sessionId);
        broadcastFnb(ctx, 'tabs').catch(() => {});
        return NextResponse.json({ data: result });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action` } },
      { status: 404 },
    );
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
