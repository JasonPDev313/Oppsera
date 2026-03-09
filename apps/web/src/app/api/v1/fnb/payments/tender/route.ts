import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { broadcastFnb } from '@oppsera/core/realtime';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { AppError, ValidationError } from '@oppsera/shared';
import { withTenant } from '@oppsera/db';
import { recordSplitTender, recordSplitTenderSchema } from '@oppsera/module-fnb';
import { validateHouseAccountCharge } from '@oppsera/module-fnb/helpers/house-account-validation';

/**
 * POST /api/v1/fnb/payments/tender — record a split tender
 *
 * For card tenders: if a token or paymentMethodId is included and gateway is configured,
 * processes through PaymentsGatewayApi.sale() before recording.
 * For house_account: CMAA re-validation before recording (credit, status, limits, hours, tip cap).
 * For cash/gift_card: records directly without gateway.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    // Validate input before any processing
    const parsed = recordSplitTenderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;

    // ── House account: CMAA re-validation at charge time ──
    if (input.tenderType === 'house_account') {
      if (!input.billingAccountId || !input.customerId) {
        throw new AppError(
          'MISSING_HOUSE_ACCOUNT_DATA',
          'billingAccountId and customerId are required for house account tenders',
          400,
        );
      }

      // Re-validate all CMAA gates (account status, collections, credit, limits, hours, tip cap)
      await validateHouseAccountCharge(ctx, {
        billingAccountId: input.billingAccountId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        tipCents: input.tipCents ?? 0,
      });

      // Store house account metadata + signature on the payment session
      await withTenant(ctx.tenantId, async (tx) => {
        await tx.execute(
          sql`UPDATE fnb_payment_sessions
              SET house_account_id = ${input.billingAccountId},
                  house_customer_id = ${input.customerId},
                  house_signature_data = ${input.signatureData ?? null},
                  updated_at = NOW()
              WHERE id = ${input.sessionId}
                AND tenant_id = ${ctx.tenantId}`,
        );
      });

      auditLogDeferred(ctx, 'house_account.charge_validated', 'billing_account', input.billingAccountId, undefined, {
        amountCents: input.amountCents,
        tipCents: input.tipCents ?? 0,
        customerId: input.customerId,
        sessionId: input.sessionId,
        hasSignature: !!input.signatureData,
      });
    }

    // Card tenders with token/paymentMethodId go through the gateway
    if (input.tenderType === 'card' && (body.token || body.paymentMethodId) && hasPaymentsGateway()) {
      const gateway = getPaymentsGatewayApi();
      const tipCents = Number(body.tipCents ?? 0);

      const gatewayResult = await gateway.sale(ctx, {
        amountCents: input.amountCents + tipCents,
        token: body.token,
        paymentMethodId: body.paymentMethodId,
        orderId: body.orderId,
        customerId: body.customerId,
        tipCents,
        ecomind: 'T',
        metadata: { source: 'fnb_pos', sessionId: input.sessionId },
        clientRequestId: input.clientRequestId ?? `tender-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Use the payment intent ID as the tender ID for cross-reference
      input.tenderId = input.tenderId ?? gatewayResult.id;
    }

    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    // Gateway charge rollback: if recordSplitTender fails after gateway charged,
    // best-effort void prevents orphaned charges (retail pattern from orders/tenders)
    const gatewayCharged = input.tenderType === 'card' && input.tenderId && (body.token || body.paymentMethodId);
    let result;
    try {
      result = await recordSplitTender(ctx, ctx.locationId, input);
    } catch (err) {
      if (gatewayCharged && hasPaymentsGateway()) {
        try { await getPaymentsGatewayApi().void(ctx, { paymentIntentId: input.tenderId! }); } catch { /* best-effort */ }
      }
      throw err;
    }
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: result! }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
