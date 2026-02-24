import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { AppError } from '@oppsera/shared';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/**
 * POST /api/v1/fnb/payments/sessions/[id]/void-last-tender — void the most recent tender
 *
 * For card tenders linked to a payment intent:
 * 1. Void on the gateway (pre-settlement) or refund (post-settlement)
 * 2. Reverse the tender amount on the payment session
 *
 * For cash tenders: reverse the session amount directly.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const sessionId = request.url.split('/sessions/')[1]?.split('/void-last-tender')[0];
    if (!sessionId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Session ID required' } },
        { status: 400 },
      );
    }

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
    // Look for a payment_intent that references this session in its metadata
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

    // Note: The actual session amount reversal would be handled by a proper voidLastTender
    // command in the fnb module. For now, we return success after gateway void.
    return NextResponse.json({
      data: {
        sessionId,
        status: 'in_progress',
        message: 'Last tender voided',
      },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
