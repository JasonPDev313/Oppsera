/**
 * Stripe payment gateway abstraction.
 * Falls back to console.info in dev when STRIPE_SECRET_KEY is missing.
 */

export interface PaymentGateway {
  createCustomer(email: string, name: string): Promise<{ customerId: string }>;
  createPaymentIntent(input: {
    customerId: string;
    amountCents: number;
    currency: string;
    paymentMethodId: string;
    capture?: boolean;
    idempotencyKey?: string;
    description?: string;
  }): Promise<{ chargeId: string; status: string }>;
  capturePaymentIntent(chargeId: string, amountCents?: number): Promise<{ status: string }>;
  refund(input: {
    chargeId: string;
    amountCents?: number;
    reason?: string;
    idempotencyKey?: string;
  }): Promise<{ refundId: string; status: string }>;
}

class DevPaymentGateway implements PaymentGateway {
  async createCustomer(email: string, name: string) {
    console.info(`[DevGateway] createCustomer: ${name} <${email}>`);
    return { customerId: `dev_cus_${Date.now()}` };
  }

  async createPaymentIntent(input: {
    customerId: string;
    amountCents: number;
    currency: string;
    paymentMethodId: string;
    capture?: boolean;
    idempotencyKey?: string;
    description?: string;
  }) {
    const status = input.capture === false ? 'requires_capture' : 'succeeded';
    console.info(
      `[DevGateway] createPaymentIntent: $${(input.amountCents / 100).toFixed(2)} ${input.currency} [${status}]`,
    );
    return { chargeId: `dev_pi_${Date.now()}`, status };
  }

  async capturePaymentIntent(chargeId: string) {
    console.info(`[DevGateway] capturePaymentIntent: ${chargeId}`);
    return { status: 'succeeded' };
  }

  async refund(input: { chargeId: string; amountCents?: number; reason?: string }) {
    console.info(
      `[DevGateway] refund: ${input.chargeId} ${input.amountCents ? `$${(input.amountCents / 100).toFixed(2)}` : 'full'}`,
    );
    return { refundId: `dev_re_${Date.now()}`, status: 'succeeded' };
  }
}

class StripePaymentGateway implements PaymentGateway {
  private stripe: any;
  private secretKey: string;
  private initialized = false;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
    this.stripe = null;
  }

  private async ensureStripe(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const pkg = 'str' + 'ipe';
      const mod = await import(/* webpackIgnore: true */ pkg);
      const Stripe = mod.default ?? mod;
      this.stripe = new Stripe(this.secretKey, { apiVersion: '2024-12-18.acacia' });
    } catch {
      console.warn('[StripeGateway] stripe package not installed, falling back to dev gateway');
      this.stripe = null;
    }
  }

  async createCustomer(email: string, name: string) {
    await this.ensureStripe();
    if (!this.stripe) return new DevPaymentGateway().createCustomer(email, name);
    const customer = await this.stripe.customers.create({ email, name });
    return { customerId: customer.id };
  }

  async createPaymentIntent(input: {
    customerId: string;
    amountCents: number;
    currency: string;
    paymentMethodId: string;
    capture?: boolean;
    idempotencyKey?: string;
    description?: string;
  }) {
    await this.ensureStripe();
    if (!this.stripe) return new DevPaymentGateway().createPaymentIntent(input);
    const pi = await this.stripe.paymentIntents.create(
      {
        customer: input.customerId,
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        payment_method: input.paymentMethodId,
        confirm: true,
        capture_method: input.capture === false ? 'manual' : 'automatic',
        description: input.description,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    return { chargeId: pi.id, status: pi.status };
  }

  async capturePaymentIntent(chargeId: string, amountCents?: number) {
    await this.ensureStripe();
    if (!this.stripe) return new DevPaymentGateway().capturePaymentIntent(chargeId);
    const pi = await this.stripe.paymentIntents.capture(
      chargeId,
      amountCents ? { amount_to_capture: amountCents } : undefined,
    );
    return { status: pi.status };
  }

  async refund(input: {
    chargeId: string;
    amountCents?: number;
    reason?: string;
    idempotencyKey?: string;
  }) {
    await this.ensureStripe();
    if (!this.stripe) return new DevPaymentGateway().refund(input);
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.chargeId,
        amount: input.amountCents,
        reason: input.reason === 'duplicate' ? 'duplicate' : input.reason === 'fraudulent' ? 'fraudulent' : 'requested_by_customer',
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    return { refundId: refund.id, status: refund.status };
  }
}

let _gateway: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (!_gateway) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      _gateway = new StripePaymentGateway(secretKey);
    } else {
      console.info('[PaymentGateway] No STRIPE_SECRET_KEY — using dev gateway');
      _gateway = new DevPaymentGateway();
    }
  }
  return _gateway;
}
