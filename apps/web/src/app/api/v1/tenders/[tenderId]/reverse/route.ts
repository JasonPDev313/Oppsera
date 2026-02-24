import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError, ValidationError } from '@oppsera/shared';
import { reverseTender, reverseTenderSchema } from '@oppsera/module-payments';
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
 * For card tenders with a linked payment intent:
 * - Void reversal: calls gateway.void() (best-effort)
 * - Refund reversal: calls gateway.refund() (blocks on failure — customer must get money back)
 *
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

    // Check if this tender has a linked payment intent for gateway processing
    if (hasPaymentsGateway()) {
      const tender = await withTenant(ctx.tenantId, async (tx) => {
        const rows = await tx.execute(
          sql`SELECT metadata FROM tenders
              WHERE id = ${tenderId} AND tenant_id = ${ctx.tenantId}`,
        );
        const result = Array.from(rows as Iterable<Record<string, unknown>>);
        return result[0] ?? null;
      });

      const metadata = tender?.metadata as Record<string, unknown> | null;
      const paymentIntentId = metadata?.paymentIntentId as string | undefined;

      if (paymentIntentId) {
        const gateway = getPaymentsGatewayApi();

        if (parsed.data.reversalType === 'void') {
          // Best-effort void — gateway failure doesn't block local reversal
          try {
            await gateway.void(ctx, {
              paymentIntentId,
              clientRequestId: `reverse-void-${tenderId}-${Date.now()}`,
            });
          } catch {
            console.error(`Failed to void gateway payment ${paymentIntentId} for tender ${tenderId}`);
          }
        } else if (parsed.data.reversalType === 'refund') {
          // Refund MUST succeed on gateway — customer needs their money back
          const refundResult = await gateway.refund(ctx, {
            paymentIntentId,
            amountCents: parsed.data.amount,
            clientRequestId: `reverse-refund-${tenderId}-${Date.now()}`,
          });

          if (refundResult.status === 'error' || refundResult.status === 'declined') {
            throw new AppError(
              'REFUND_FAILED',
              refundResult.errorMessage ?? 'Card refund failed on the payment gateway',
              502,
            );
          }
        }
      }
    }

    const result = await reverseTender(ctx, tenderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'tenders.refund' , writeAccess: true },
);
