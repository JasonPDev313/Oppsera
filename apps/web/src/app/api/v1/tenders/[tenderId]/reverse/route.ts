import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError, ValidationError } from '@oppsera/shared';
import { reverseTender, confirmTenderReversal, failTenderReversal, reverseTenderSchema } from '@oppsera/module-payments';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

function extractTenderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

/**
 * POST /api/v1/tenders/:tenderId/reverse — reverse a tender
 *
 * Two-phase state machine for card refunds (Bug #8 fix):
 *   1. DB: create reversal record as 'pending_refund'
 *   2. Gateway: call refund (idempotent via deterministic clientRequestId)
 *   3. DB: confirm → 'completed' + emit event + GL
 *
 * If gateway fails after step 1, reversal stays as 'pending_refund' with
 * no money moved — safe to retry. If step 3 fails after gateway succeeds,
 * the reversal record exists and can be confirmed on retry (gateway call
 * is idempotent).
 *
 * Voids are best-effort (gateway failure doesn't block).
 * Cash/check/voucher tenders bypass the gateway entirely.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tenderId = extractTenderId(request);
    const body = await request.json();
    const parsed = reverseTenderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Resolve gateway context before any DB work
    let paymentIntentId: string | undefined;
    const needsGateway = hasPaymentsGateway();
    if (needsGateway) {
      const tender = await withTenant(ctx.tenantId, async (tx) => {
        const rows = await tx.execute(
          sql`SELECT metadata FROM tenders
              WHERE id = ${tenderId} AND tenant_id = ${ctx.tenantId}`,
        );
        const result = Array.from(rows as Iterable<Record<string, unknown>>);
        return result[0] ?? null;
      });

      const metadata = tender?.metadata as Record<string, unknown> | null;
      paymentIntentId = metadata?.paymentIntentId as string | undefined;
    }

    const isCardRefund = !!paymentIntentId && parsed.data.reversalType === 'refund';
    const isCardVoid = !!paymentIntentId && parsed.data.reversalType === 'void';

    // ── Phase 1: Create reversal record in DB FIRST ──
    // For card refunds: status = 'pending_refund' (two-phase)
    // For voids / cash / no-gateway: status = 'completed' (single-phase)
    const phase1Result = await reverseTender(ctx, tenderId, parsed.data, {
      pendingGateway: isCardRefund,
    });

    // ── Gateway processing ──
    if (paymentIntentId && needsGateway) {
      const gateway = getPaymentsGatewayApi();

      if (isCardVoid) {
        // Best-effort void — gateway failure doesn't block local reversal
        try {
          await gateway.void(ctx, {
            paymentIntentId,
            clientRequestId: `reverse-void-${tenderId}-${phase1Result.reversalId}`,
          });
        } catch {
          console.error(`Failed to void gateway payment ${paymentIntentId} for tender ${tenderId}`);
        }
      } else if (isCardRefund) {
        // Refund MUST succeed — customer needs their money back.
        // Use reversal ID in clientRequestId for deterministic idempotency.
        try {
          const refundResult = await gateway.refund(ctx, {
            paymentIntentId,
            amountCents: parsed.data.amount,
            clientRequestId: `reverse-refund-${phase1Result.reversalId}`,
          });

          if (refundResult.status === 'error' || refundResult.status === 'declined') {
            // Gateway declined — roll back the pending reversal
            await failTenderReversal(ctx, phase1Result.reversalId);
            throw new AppError(
              'REFUND_FAILED',
              refundResult.errorMessage ?? 'Card refund failed on the payment gateway',
              502,
            );
          }

          // ── Phase 2a: Gateway succeeded → confirm the reversal ──
          const confirmed = await confirmTenderReversal(
            ctx,
            phase1Result.reversalId,
            refundResult.providerRef ?? undefined,
          );
          return NextResponse.json({ data: confirmed }, { status: 201 });
        } catch (err) {
          // If it's our own AppError (REFUND_FAILED), re-throw
          if (err instanceof AppError) throw err;

          // Network/timeout error — leave reversal as 'pending_refund' for retry.
          // Don't call failTenderReversal because we don't know if the gateway
          // actually processed the refund or not.
          console.error(`Gateway error during refund for tender ${tenderId}:`, err);
          throw new AppError(
            'GATEWAY_ERROR',
            'Payment gateway error during refund. The refund is pending and can be retried.',
            502,
          );
        }
      }
    }

    return NextResponse.json({ data: phase1Result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.refund' , writeAccess: true },
);
