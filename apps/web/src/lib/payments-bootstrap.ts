import { setPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import type { PaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';

/**
 * Wire the PaymentsGatewayApi singleton so F&B, Retail POS, and other modules
 * can process card payments without importing @oppsera/module-payments directly.
 *
 * Follows the same pattern as AccountingPostingApi, OrdersWriteApi, etc.
 */
export async function initializePaymentsGatewayApi(): Promise<void> {
  const {
    paymentsFacade,
  } = await import('@oppsera/module-payments');

  const api: PaymentsGatewayApi = {
    authorize: async (ctx, input) => {
      const result = await paymentsFacade.authorize(ctx, {
        amountCents: input.amountCents,
        currency: input.currency,
        token: input.token,
        paymentMethodId: input.paymentMethodId,
        orderId: input.orderId,
        customerId: input.customerId,
        tipCents: input.tipCents,
        ecomind: input.ecomind,
        metadata: input.metadata,
        clientRequestId: input.clientRequestId,
      });
      return {
        id: result.id,
        status: result.status,
        amountCents: result.amountCents,
        authorizedAmountCents: result.authorizedAmountCents,
        capturedAmountCents: result.capturedAmountCents,
        refundedAmountCents: result.refundedAmountCents,
        providerRef: result.providerRef,
        cardLast4: result.cardLast4,
        cardBrand: result.cardBrand,
        errorMessage: result.errorMessage,
      };
    },

    capture: async (ctx, input) => {
      const result = await paymentsFacade.capture(ctx, {
        paymentIntentId: input.paymentIntentId,
        amountCents: input.amountCents,
        tipCents: input.tipCents,
        clientRequestId: input.clientRequestId,
      });
      return {
        id: result.id,
        status: result.status,
        amountCents: result.amountCents,
        authorizedAmountCents: result.authorizedAmountCents,
        capturedAmountCents: result.capturedAmountCents,
        refundedAmountCents: result.refundedAmountCents,
        providerRef: result.providerRef,
        cardLast4: result.cardLast4,
        cardBrand: result.cardBrand,
        errorMessage: result.errorMessage,
      };
    },

    sale: async (ctx, input) => {
      const result = await paymentsFacade.sale(ctx, {
        amountCents: input.amountCents,
        currency: input.currency,
        token: input.token,
        paymentMethodId: input.paymentMethodId,
        orderId: input.orderId,
        customerId: input.customerId,
        tipCents: input.tipCents,
        ecomind: input.ecomind,
        metadata: input.metadata,
        clientRequestId: input.clientRequestId,
      });
      return {
        id: result.id,
        status: result.status,
        amountCents: result.amountCents,
        authorizedAmountCents: result.authorizedAmountCents,
        capturedAmountCents: result.capturedAmountCents,
        refundedAmountCents: result.refundedAmountCents,
        providerRef: result.providerRef,
        cardLast4: result.cardLast4,
        cardBrand: result.cardBrand,
        errorMessage: result.errorMessage,
      };
    },

    void: async (ctx, input) => {
      const result = await paymentsFacade.void(ctx, {
        paymentIntentId: input.paymentIntentId,
        clientRequestId: input.clientRequestId,
      });
      return {
        id: result.id,
        status: result.status,
        amountCents: result.amountCents,
        authorizedAmountCents: result.authorizedAmountCents,
        capturedAmountCents: result.capturedAmountCents,
        refundedAmountCents: result.refundedAmountCents,
        providerRef: result.providerRef,
        cardLast4: result.cardLast4,
        cardBrand: result.cardBrand,
        errorMessage: result.errorMessage,
      };
    },

    refund: async (ctx, input) => {
      const result = await paymentsFacade.refund(ctx, {
        paymentIntentId: input.paymentIntentId,
        amountCents: input.amountCents,
        clientRequestId: input.clientRequestId,
      });
      return {
        id: result.id,
        status: result.status,
        amountCents: result.amountCents,
        authorizedAmountCents: result.authorizedAmountCents,
        capturedAmountCents: result.capturedAmountCents,
        refundedAmountCents: result.refundedAmountCents,
        providerRef: result.providerRef,
        cardLast4: result.cardLast4,
        cardBrand: result.cardBrand,
        errorMessage: result.errorMessage,
      };
    },
  };

  setPaymentsGatewayApi(api);
}
