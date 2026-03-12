import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { broadcastFnb } from '@oppsera/core/realtime';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { AppError, ValidationError } from '@oppsera/shared';
import { payTab, payTabSchema } from '@oppsera/module-fnb';
import { validateHouseAccountCharge } from '@oppsera/module-fnb/helpers/house-account-validation';

/**
 * POST /api/v1/fnb/payments/pay — unified single-trip payment
 *
 * Handles ALL tender types in one HTTP round-trip:
 * 1. Pre-transaction: gateway charge (card) or CMAA validation (house account)
 * 2. Single DB transaction: create session + record tender + auto-complete if fully paid
 * 3. Post-transaction: broadcast realtime update
 *
 * ~3× faster than the sequential 3-call flow (start session → record tender → complete).
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw body before validation
    let body: any = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }

    const parsed = payTabSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const input = parsed.data;
    let gatewayInfo: Record<string, unknown> | null = null;

    // ── Pre-transaction: Card gateway charge ──────────────────────
    if (input.tenderType === 'card' && (body.token || body.paymentMethodId)) {
      if (!hasPaymentsGateway()) {
        throw new AppError(
          'GATEWAY_NOT_CONFIGURED',
          'Payment gateway is not configured. Set up a merchant account in Merchant Services settings.',
          503,
        );
      }

      const gateway = getPaymentsGatewayApi();
      const gatewayResult = await gateway.sale(ctx, {
        amountCents: input.amountCents + input.tipCents,
        token: body.token,
        paymentMethodId: body.paymentMethodId,
        orderId: body.orderId,
        customerId: body.customerId,
        tipCents: input.tipCents,
        ecomind: 'T',
        metadata: { source: 'fnb_pos', tabId: input.tabId },
        clientRequestId: input.clientRequestId ?? `pay-${Date.now()}`,
      });

      if (gatewayResult.status === 'declined' || gatewayResult.status === 'error') {
        throw new AppError(
          'PAYMENT_DECLINED',
          gatewayResult.errorMessage ?? 'Card payment was declined',
          402,
        );
      }

      // Pass the gateway-assigned ID as the tender ID for cross-reference
      input.tenderId = gatewayResult.id;

      gatewayInfo = {
        paymentIntentId: gatewayResult.id,
        status: gatewayResult.status,
        providerRef: gatewayResult.providerRef,
        cardLast4: gatewayResult.cardLast4,
        cardBrand: gatewayResult.cardBrand,
        amountCents: gatewayResult.amountCents,
      };
    }

    // ── Pre-transaction: House account CMAA validation ────────────
    if (input.tenderType === 'house_account') {
      if (!input.billingAccountId || !input.customerId) {
        throw new AppError(
          'MISSING_HOUSE_ACCOUNT_DATA',
          'billingAccountId and customerId are required for house account tenders',
          400,
        );
      }

      await validateHouseAccountCharge(ctx, {
        billingAccountId: input.billingAccountId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        tipCents: input.tipCents ?? 0,
      });

      auditLogDeferred(ctx, 'house_account.charge_validated', 'billing_account', input.billingAccountId, undefined, {
        amountCents: input.amountCents,
        tipCents: input.tipCents ?? 0,
        customerId: input.customerId,
        tabId: input.tabId,
        hasSignature: !!input.signatureData,
      });
    }

    // ── Single-transaction: session + tender + auto-complete ──────
    // Gateway charge rollback: if payTab fails after gateway charged,
    // best-effort void prevents orphaned charges
    const gatewayCharged = input.tenderType === 'card' && input.tenderId && (body.token || body.paymentMethodId);
    let payResult;
    try {
      payResult = await payTab(ctx, ctx.locationId, input, { deferDispatch: true });
    } catch (err) {
      if (gatewayCharged && hasPaymentsGateway()) {
        try {
          await getPaymentsGatewayApi().void(ctx, {
            paymentIntentId: input.tenderId!,
            clientRequestId: `void-${input.clientRequestId}`,
          });
        } catch { /* best-effort */ }
      }
      throw err;
    }

    // Dispatch events + broadcast AFTER the response is sent.
    // Vercel keeps the function alive until after() callbacks complete (Next.js 15).
    // Events are durable in the outbox — the outbox worker is the safety net.
    after(async () => {
      await payResult.dispatchEvents();
      broadcastFnb(ctx, 'tabs').catch(() => {});
    });

    const responseData = gatewayInfo
      ? { ...payResult.result, gateway: gatewayInfo }
      : payResult.result;

    return NextResponse.json({ data: responseData }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create', writeAccess: true },
);
