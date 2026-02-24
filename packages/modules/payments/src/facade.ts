import type { RequestContext } from '@oppsera/core/auth/context';
import type { AuthorizePaymentInput, CapturePaymentInput, SalePaymentInput, VoidPaymentInput, RefundPaymentInput, TokenizeCardInput, CreatePaymentProfileInput, InquirePaymentInput } from './gateway-validation';
import { authorizePayment } from './commands/authorize';
import { capturePayment } from './commands/capture';
import { salePayment } from './commands/sale';
import { voidPayment } from './commands/void-payment';
import { refundPayment } from './commands/refund';
import { tokenizeCard } from './commands/tokenize-card';
import { createPaymentProfile } from './commands/create-payment-profile';
import { inquirePaymentIntent } from './commands/inquire';

import type { PaymentIntentResult, TokenResult, PaymentProfileResult } from './types/gateway-results';

/**
 * PaymentsFacade — single entry point for all payment operations.
 *
 * All POS/online/recurring callers go through this facade.
 * The facade delegates to individual command functions that handle
 * provider resolution, idempotency, and event publishing.
 */
class PaymentsFacade {
  /**
   * Authorize a payment (hold funds, no capture).
   * Used for: bar tabs, PMS deposits, pre-auth flows.
   */
  async authorize(ctx: RequestContext, input: AuthorizePaymentInput): Promise<PaymentIntentResult> {
    return authorizePayment(ctx, input);
  }

  /**
   * Capture a previously authorized payment.
   * Used for: closing bar tabs, capturing PMS deposits, tip adjustments.
   */
  async capture(ctx: RequestContext, input: CapturePaymentInput): Promise<PaymentIntentResult> {
    return capturePayment(ctx, input);
  }

  /**
   * Sale = authorize + capture in one call.
   * Used for: retail POS, F&B payment, QR pay-at-table.
   */
  async sale(ctx: RequestContext, input: SalePaymentInput): Promise<PaymentIntentResult> {
    return salePayment(ctx, input);
  }

  /**
   * Void an authorized or captured (pre-settlement) payment.
   * Used for: order voids, payment cancellations.
   */
  async void(ctx: RequestContext, input: VoidPaymentInput): Promise<PaymentIntentResult> {
    return voidPayment(ctx, input);
  }

  /**
   * Refund a captured (post-settlement) payment. Supports partial refunds.
   * Used for: returns, partial refunds.
   */
  async refund(ctx: RequestContext, input: RefundPaymentInput): Promise<PaymentIntentResult> {
    return refundPayment(ctx, input);
  }

  /**
   * Tokenize a card number server-side.
   * In practice, the Hosted iFrame handles client-side tokenization.
   * This is for server-side flows (imports, terminal reads).
   */
  async tokenize(ctx: RequestContext, input: TokenizeCardInput): Promise<TokenResult> {
    return tokenizeCard(ctx, input);
  }

  /**
   * Create a stored payment profile (saved card).
   * Links a CardSecure token to a customer for future use.
   */
  async createProfile(ctx: RequestContext, input: CreatePaymentProfileInput): Promise<PaymentProfileResult> {
    return createPaymentProfile(ctx, input);
  }

  /**
   * Inquire about a payment intent's current status with the provider.
   */
  async inquire(ctx: RequestContext, input: InquirePaymentInput): Promise<PaymentIntentResult> {
    return inquirePaymentIntent(ctx, input);
  }
}

/** Singleton facade instance */
export const paymentsFacade = new PaymentsFacade();
