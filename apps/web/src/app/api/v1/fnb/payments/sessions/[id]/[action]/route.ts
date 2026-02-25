import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { ValidationError, AppError } from '@oppsera/shared';
import {
  completePaymentSession,
  completePaymentSessionSchema,
  failPaymentSession,
  failPaymentSessionSchema,
} from '@oppsera/module-fnb';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

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
        const result = await completePaymentSession(ctx, ctx.locationId ?? '', parsed.data);
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
        const result = await failPaymentSession(ctx, ctx.locationId ?? '', parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'void-last-tender': {
        const sessionId = extractSessionId(request);

        // Find the session and most recent tender info
        const sessionData = await withTenant(ctx.tenantId, async (tx) => {
          const sessions = await tx.execute(
            sql`SELECT id, status, paid_amount_cents, total_amount_cents
                FROM fnb_payment_sessions
                WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}`,
          );
          const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
          return rows[0] ?? null;
        });

        if (!sessionData) {
          throw new AppError('SESSION_NOT_FOUND', 'Payment session not found', 404);
        }

        if (sessionData.status === 'completed') {
          throw new AppError('SESSION_COMPLETED', 'Cannot void tender on a completed session', 409);
        }

        // Check if the last tender was a card payment linked to a gateway intent
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
              if (lastIntent.status === 'authorized' || lastIntent.status === 'captured') {
                await gateway.void(ctx, {
                  paymentIntentId: lastIntent.id as string,
                  clientRequestId: `void-tender-${sessionId}-${Date.now()}`,
                });
              }
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

        return NextResponse.json({
          data: {
            sessionId,
            status: 'in_progress',
            message: 'Last tender voided',
          },
        });
      }
    }
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
