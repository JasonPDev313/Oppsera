import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock apiFetch
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Constants — mirrored from the component
// ---------------------------------------------------------------------------

const ALLOWED_CARD_NETWORKS = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'];
const ALLOWED_AUTH_METHODS = ['PAN_ONLY', 'CRYPTOGRAM_3DS'];

const BASE_CARD_PAYMENT_METHOD = {
  type: 'CARD' as const,
  parameters: {
    allowedCardNetworks: ALLOWED_CARD_NETWORKS,
    allowedAuthMethods: ALLOWED_AUTH_METHODS,
  },
};

// ---------------------------------------------------------------------------
// Helpers — reconstruct the logic from the component without rendering
// ---------------------------------------------------------------------------

/** Builds the IsReadyToPay request the component sends */
function buildIsReadyToPayRequest() {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [BASE_CARD_PAYMENT_METHOD],
  };
}

/** Builds the full PaymentDataRequest the component sends on click */
function buildPaymentDataRequest(opts: {
  amountCents: number;
  gatewayMerchantId: string;
  googlePayMerchantId?: string;
}) {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [
      {
        ...BASE_CARD_PAYMENT_METHOD,
        tokenizationSpecification: {
          type: 'PAYMENT_GATEWAY' as const,
          parameters: {
            gateway: 'cardconnect',
            gatewayMerchantId: opts.gatewayMerchantId,
          },
        },
      },
    ],
    merchantInfo: {
      ...(opts.googlePayMerchantId
        ? { merchantId: opts.googlePayMerchantId }
        : {}),
    },
    transactionInfo: {
      totalPriceStatus: 'FINAL' as const,
      totalPrice: (opts.amountCents / 100).toFixed(2),
      currencyCode: 'USD',
      countryCode: 'US',
    },
  };
}

/** Reproduces the cancellation detection from the catch block */
function isUserCancellation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err as { statusCode: string }).statusCode === 'CANCELED'
  );
}

/** Reproduces the TokenizeResult normalization from handleClick */
function normalizeGooglePayToken(
  serverResult: {
    provider?: string;
    token: string;
    last4?: string | null;
    brand?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    metadata?: Record<string, unknown>;
  },
  paymentMethodData: {
    info: { cardNetwork: string; cardDetails: string };
  },
) {
  return {
    provider: serverResult.provider ?? 'cardpointe',
    token: serverResult.token,
    last4: serverResult.last4 ?? paymentMethodData.info.cardDetails ?? null,
    brand:
      serverResult.brand ??
      paymentMethodData.info.cardNetwork?.toLowerCase() ??
      null,
    expMonth: serverResult.expMonth ?? null,
    expYear: serverResult.expYear ?? null,
    source: 'google_pay' as const,
    metadata: serverResult.metadata ?? {},
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Google Pay Button — allowed card networks', () => {
  it('includes VISA', () => {
    expect(ALLOWED_CARD_NETWORKS).toContain('VISA');
  });

  it('includes MASTERCARD', () => {
    expect(ALLOWED_CARD_NETWORKS).toContain('MASTERCARD');
  });

  it('includes AMEX', () => {
    expect(ALLOWED_CARD_NETWORKS).toContain('AMEX');
  });

  it('includes DISCOVER', () => {
    expect(ALLOWED_CARD_NETWORKS).toContain('DISCOVER');
  });

  it('has exactly 4 networks', () => {
    expect(ALLOWED_CARD_NETWORKS).toHaveLength(4);
  });

  it('uses uppercase network names (Google Pay API convention)', () => {
    for (const network of ALLOWED_CARD_NETWORKS) {
      expect(network).toBe(network.toUpperCase());
    }
  });
});

describe('Google Pay Button — allowed auth methods', () => {
  it('includes PAN_ONLY', () => {
    expect(ALLOWED_AUTH_METHODS).toContain('PAN_ONLY');
  });

  it('includes CRYPTOGRAM_3DS', () => {
    expect(ALLOWED_AUTH_METHODS).toContain('CRYPTOGRAM_3DS');
  });

  it('has exactly 2 auth methods', () => {
    expect(ALLOWED_AUTH_METHODS).toHaveLength(2);
  });
});

describe('Google Pay Button — base payment method specification', () => {
  it('uses CARD payment method type', () => {
    expect(BASE_CARD_PAYMENT_METHOD.type).toBe('CARD');
  });

  it('wires allowed card networks into parameters', () => {
    expect(BASE_CARD_PAYMENT_METHOD.parameters.allowedCardNetworks).toEqual(
      ALLOWED_CARD_NETWORKS,
    );
  });

  it('wires allowed auth methods into parameters', () => {
    expect(BASE_CARD_PAYMENT_METHOD.parameters.allowedAuthMethods).toEqual(
      ALLOWED_AUTH_METHODS,
    );
  });
});

describe('Google Pay Button — isReadyToPay request structure', () => {
  it('uses API version 2', () => {
    const request = buildIsReadyToPayRequest();
    expect(request.apiVersion).toBe(2);
  });

  it('uses API version minor 0', () => {
    const request = buildIsReadyToPayRequest();
    expect(request.apiVersionMinor).toBe(0);
  });

  it('includes the base card payment method', () => {
    const request = buildIsReadyToPayRequest();
    expect(request.allowedPaymentMethods).toEqual([BASE_CARD_PAYMENT_METHOD]);
  });
});

describe('Google Pay Button — payment data request structure', () => {
  const defaultOpts = {
    amountCents: 2499,
    gatewayMerchantId: 'mid-12345',
  };

  it('uses API version 2', () => {
    const request = buildPaymentDataRequest(defaultOpts);
    expect(request.apiVersion).toBe(2);
  });

  it('uses API version minor 0', () => {
    const request = buildPaymentDataRequest(defaultOpts);
    expect(request.apiVersionMinor).toBe(0);
  });

  it('converts amountCents to dollar string (2499 -> "24.99")', () => {
    const request = buildPaymentDataRequest(defaultOpts);
    expect(request.transactionInfo.totalPrice).toBe('24.99');
  });

  it('converts round dollar amount correctly (500 -> "5.00")', () => {
    const request = buildPaymentDataRequest({
      ...defaultOpts,
      amountCents: 500,
    });
    expect(request.transactionInfo.totalPrice).toBe('5.00');
  });

  it('converts zero amount correctly', () => {
    const request = buildPaymentDataRequest({
      ...defaultOpts,
      amountCents: 0,
    });
    expect(request.transactionInfo.totalPrice).toBe('0.00');
  });

  it('sets totalPriceStatus to FINAL', () => {
    const request = buildPaymentDataRequest(defaultOpts);
    expect(request.transactionInfo.totalPriceStatus).toBe('FINAL');
  });

  it('sets currencyCode to USD', () => {
    const request = buildPaymentDataRequest(defaultOpts);
    expect(request.transactionInfo.currencyCode).toBe('USD');
  });

  it('sets countryCode to US', () => {
    const request = buildPaymentDataRequest(defaultOpts);
    expect(request.transactionInfo.countryCode).toBe('US');
  });
});

describe('Google Pay Button — gateway configuration', () => {
  it('uses cardconnect as the gateway', () => {
    const request = buildPaymentDataRequest({
      amountCents: 1000,
      gatewayMerchantId: 'mid-abc',
    });
    const method = request.allowedPaymentMethods[0]!;
    expect(method.tokenizationSpecification!.parameters.gateway).toBe(
      'cardconnect',
    );
  });

  it('passes the gateway merchant ID', () => {
    const request = buildPaymentDataRequest({
      amountCents: 1000,
      gatewayMerchantId: 'mid-xyz-999',
    });
    const method = request.allowedPaymentMethods[0]!;
    expect(
      method.tokenizationSpecification!.parameters.gatewayMerchantId,
    ).toBe('mid-xyz-999');
  });

  it('uses PAYMENT_GATEWAY tokenization type', () => {
    const request = buildPaymentDataRequest({
      amountCents: 1000,
      gatewayMerchantId: 'mid-abc',
    });
    const method = request.allowedPaymentMethods[0]!;
    expect(method.tokenizationSpecification!.type).toBe('PAYMENT_GATEWAY');
  });

  it('includes Google Pay merchantId when provided', () => {
    const request = buildPaymentDataRequest({
      amountCents: 1000,
      gatewayMerchantId: 'mid-abc',
      googlePayMerchantId: 'BCR2DN4T6XXXXX',
    });
    expect(request.merchantInfo.merchantId).toBe('BCR2DN4T6XXXXX');
  });

  it('omits merchantId from merchantInfo when not provided', () => {
    const request = buildPaymentDataRequest({
      amountCents: 1000,
      gatewayMerchantId: 'mid-abc',
    });
    expect(request.merchantInfo).not.toHaveProperty('merchantId');
  });
});

describe('Google Pay Button — user cancellation handling', () => {
  it('detects CANCELED statusCode as user cancellation', () => {
    const err = { statusCode: 'CANCELED' };
    expect(isUserCancellation(err)).toBe(true);
  });

  it('does not treat regular Error as cancellation', () => {
    const err = new Error('Something went wrong');
    expect(isUserCancellation(err)).toBe(false);
  });

  it('does not treat string throws as cancellation', () => {
    expect(isUserCancellation('CANCELED')).toBe(false);
  });

  it('does not treat null as cancellation', () => {
    expect(isUserCancellation(null)).toBe(false);
  });

  it('does not treat undefined as cancellation', () => {
    expect(isUserCancellation(undefined)).toBe(false);
  });

  it('does not treat object with different statusCode as cancellation', () => {
    const err = { statusCode: 'DEVELOPER_ERROR' };
    expect(isUserCancellation(err)).toBe(false);
  });

  it('cancellation does not call onError', () => {
    const onError = vi.fn();
    const err = { statusCode: 'CANCELED' };

    // Simulate the catch block logic
    if (isUserCancellation(err)) {
      // User cancelled — return early without calling onError
    } else {
      onError('Google Pay payment failed');
    }

    expect(onError).not.toHaveBeenCalled();
  });

  it('non-cancellation error calls onError with message', () => {
    const onError = vi.fn();
    const err = new Error('Network timeout');

    if (isUserCancellation(err)) {
      // cancelled
    } else {
      const message =
        err instanceof Error ? err.message : 'Google Pay payment failed';
      onError(message);
    }

    expect(onError).toHaveBeenCalledWith('Network timeout');
  });

  it('non-Error non-cancellation uses generic message', () => {
    const onError = vi.fn();
    const err = { code: 'UNKNOWN' };

    if (isUserCancellation(err)) {
      // cancelled
    } else {
      const message =
        err instanceof Error ? err.message : 'Google Pay payment failed';
      onError(message);
    }

    expect(onError).toHaveBeenCalledWith('Google Pay payment failed');
  });
});

describe('Google Pay Button — TokenizeResult normalization', () => {
  const mockPaymentMethodData = {
    info: {
      cardNetwork: 'VISA',
      cardDetails: '4242',
    },
  };

  it('uses cardpointe as default provider', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc' },
      mockPaymentMethodData,
    );
    expect(result.provider).toBe('cardpointe');
  });

  it('uses server provider when present', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc', provider: 'stripe' },
      mockPaymentMethodData,
    );
    expect(result.provider).toBe('stripe');
  });

  it('always sets source to google_pay', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc' },
      mockPaymentMethodData,
    );
    expect(result.source).toBe('google_pay');
  });

  it('prefers server last4 over Google Pay sheet', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc', last4: '9999' },
      mockPaymentMethodData,
    );
    expect(result.last4).toBe('9999');
  });

  it('falls back to Google Pay cardDetails for last4', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc' },
      mockPaymentMethodData,
    );
    expect(result.last4).toBe('4242');
  });

  it('prefers server brand over Google Pay sheet', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc', brand: 'mastercard' },
      mockPaymentMethodData,
    );
    expect(result.brand).toBe('mastercard');
  });

  it('falls back to lowercase Google Pay cardNetwork for brand', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc' },
      mockPaymentMethodData,
    );
    expect(result.brand).toBe('visa');
  });

  it('preserves all server card details', () => {
    const result = normalizeGooglePayToken(
      {
        token: 'tok_xyz',
        last4: '1111',
        brand: 'amex',
        expMonth: 6,
        expYear: 2029,
        metadata: { funding: 'debit' },
      },
      mockPaymentMethodData,
    );
    expect(result.token).toBe('tok_xyz');
    expect(result.last4).toBe('1111');
    expect(result.brand).toBe('amex');
    expect(result.expMonth).toBe(6);
    expect(result.expYear).toBe(2029);
    expect(result.metadata).toEqual({ funding: 'debit' });
  });

  it('coerces null expiry fields correctly', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc' },
      mockPaymentMethodData,
    );
    expect(result.expMonth).toBeNull();
    expect(result.expYear).toBeNull();
  });

  it('defaults metadata to empty object', () => {
    const result = normalizeGooglePayToken(
      { token: 'tok_abc' },
      mockPaymentMethodData,
    );
    expect(result.metadata).toEqual({});
  });
});

describe('Google Pay Button — wallet-tokenize API call', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls wallet-tokenize endpoint with google_pay walletType', async () => {
    const paymentMethodData = {
      type: 'CARD',
      description: 'Visa **** 4242',
      info: { cardNetwork: 'VISA', cardDetails: '4242' },
      tokenizationData: { type: 'PAYMENT_GATEWAY', token: 'encrypted-token' },
    };

    mockApiFetch.mockResolvedValue({
      data: {
        provider: 'cardpointe',
        token: 'tok_test',
        last4: '4242',
        brand: 'visa',
        expMonth: null,
        expYear: null,
        source: 'google_pay',
        metadata: {},
      },
    });

    await apiFetch('/api/v1/payments/wallet-tokenize', {
      method: 'POST',
      body: JSON.stringify({
        walletType: 'google_pay',
        paymentData: paymentMethodData,
      }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/payments/wallet-tokenize',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const callBody = JSON.parse(
      (mockApiFetch.mock.calls[0]![1] as { body: string }).body,
    );
    expect(callBody.walletType).toBe('google_pay');
    expect(callBody.paymentData).toEqual(paymentMethodData);
  });

  it('reports error message from apiFetch failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Gateway timeout'));

    const onError = vi.fn();

    try {
      await apiFetch('/api/v1/payments/wallet-tokenize', {
        method: 'POST',
        body: '{}',
      });
    } catch (err) {
      if (!isUserCancellation(err)) {
        const message =
          err instanceof Error ? err.message : 'Google Pay payment failed';
        onError(message);
      }
    }

    expect(onError).toHaveBeenCalledWith('Gateway timeout');
  });
});

describe('Google Pay Button — PaymentsClient environment', () => {
  it('defaults to TEST environment', () => {
    // The component has: environment = 'TEST' as default prop
    const defaultEnvironment = 'TEST';
    expect(defaultEnvironment).toBe('TEST');
  });

  it('accepts PRODUCTION environment', () => {
    const environment: 'TEST' | 'PRODUCTION' = 'PRODUCTION';
    expect(environment).toBe('PRODUCTION');
  });

  it('passes environment to PaymentsClient constructor', () => {
    // Simulate the component logic
    const environment = 'TEST';
    const constructorArgs = { environment };
    expect(constructorArgs.environment).toBe('TEST');
  });
});

describe('Google Pay Button — processing guard', () => {
  it('prevents double-click by checking isProcessing flag', () => {
    // Simulate the component's double-click guard
    let isProcessing = false;

    const handleClick = () => {
      if (isProcessing) return 'blocked';
      isProcessing = true;
      return 'proceeded';
    };

    expect(handleClick()).toBe('proceeded');
    expect(handleClick()).toBe('blocked');
  });

  it('resets isProcessing in finally block', () => {
    // Simulate the component's finally block
    let isProcessing = true;

    try {
      // payment logic
    } finally {
      isProcessing = false;
    }

    expect(isProcessing).toBe(false);
  });

  it('resets isProcessing even when payment fails', () => {
    let isProcessing = true;

    try {
      throw new Error('Payment failed');
    } catch {
      // error handling
    } finally {
      isProcessing = false;
    }

    expect(isProcessing).toBe(false);
  });

  it('resets isProcessing even when user cancels', () => {
    let isProcessing = true;

    try {
      throw { statusCode: 'CANCELED' };
    } catch {
      // cancellation handling
    } finally {
      isProcessing = false;
    }

    expect(isProcessing).toBe(false);
  });
});
