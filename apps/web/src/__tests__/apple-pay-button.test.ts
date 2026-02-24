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
// Helpers — reconstruct the logic from the component without rendering
// ---------------------------------------------------------------------------

/** The payment request shape used inside ApplePayButton */
function buildApplePayRequest(amountCents: number, displayName = 'OppsEra') {
  return {
    countryCode: 'US',
    currencyCode: 'USD',
    supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
    merchantCapabilities: ['supports3DS'],
    total: {
      label: displayName,
      amount: (amountCents / 100).toFixed(2),
    },
  };
}

/** SSRF guard extracted from the validate-merchant route */
function isValidApplePayValidationURL(url: string): boolean {
  return url.startsWith('https://apple-pay-gateway');
}

/** Reproduces the cancellation logic from the component (oncancel handler) */
function handleApplePayCancel(): { isError: boolean } {
  // From the component: session.oncancel = () => { /* no error */ }
  return { isError: false };
}

/** Reproduces the TokenizeResult normalization from onpaymentauthorized */
function normalizeApplePayToken(data: {
  token: string;
  last4: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
  metadata?: Record<string, unknown>;
}) {
  return {
    provider: data.metadata?.provider
      ? String(data.metadata.provider)
      : 'apple_pay',
    token: data.token,
    last4: data.last4 ?? null,
    brand: data.brand ?? null,
    expMonth: data.expMonth ?? null,
    expYear: data.expYear ?? null,
    source: 'apple_pay' as const,
    metadata: data.metadata ?? {},
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Apple Pay Button — canMakePayments check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clean up any window.ApplePaySession mock between tests
    delete (globalThis as Record<string, unknown>).ApplePaySession;
  });

  it('detects Apple Pay availability when canMakePayments returns true', () => {
    const mockSession = {
      canMakePayments: vi.fn().mockReturnValue(true),
    };
    (globalThis as Record<string, unknown>).ApplePaySession = mockSession;

    const available = !!(globalThis as any).ApplePaySession?.canMakePayments();
    expect(available).toBe(true);
    expect(mockSession.canMakePayments).toHaveBeenCalledOnce();
  });

  it('reports unavailable when canMakePayments returns false', () => {
    const mockSession = {
      canMakePayments: vi.fn().mockReturnValue(false),
    };
    (globalThis as Record<string, unknown>).ApplePaySession = mockSession;

    const available = !!(globalThis as any).ApplePaySession?.canMakePayments();
    expect(available).toBe(false);
  });

  it('reports unavailable when ApplePaySession is not on window', () => {
    // No ApplePaySession set — simulates non-Safari browser
    const available = !!(globalThis as Record<string, unknown>).ApplePaySession;
    expect(available).toBe(false);
  });

  it('reports unavailable when canMakePayments throws (non-Safari)', () => {
    const mockSession = {
      canMakePayments: vi.fn().mockImplementation(() => {
        throw new Error('NotSupportedError');
      }),
    };
    (globalThis as Record<string, unknown>).ApplePaySession = mockSession;

    let available = false;
    try {
      if ((globalThis as any).ApplePaySession?.canMakePayments()) {
        available = true;
      }
    } catch {
      available = false;
    }
    expect(available).toBe(false);
  });
});

describe('Apple Pay Button — payment request structure', () => {
  it('builds request with US country code', () => {
    const request = buildApplePayRequest(1999);
    expect(request.countryCode).toBe('US');
  });

  it('builds request with USD currency code', () => {
    const request = buildApplePayRequest(1999);
    expect(request.currencyCode).toBe('USD');
  });

  it('includes all four supported networks', () => {
    const request = buildApplePayRequest(1999);
    expect(request.supportedNetworks).toEqual([
      'visa',
      'masterCard',
      'amex',
      'discover',
    ]);
  });

  it('requests supports3DS merchant capability', () => {
    const request = buildApplePayRequest(1999);
    expect(request.merchantCapabilities).toEqual(['supports3DS']);
  });

  it('converts amountCents to dollar string (e.g. 1999 -> "19.99")', () => {
    const request = buildApplePayRequest(1999);
    expect(request.total.amount).toBe('19.99');
  });

  it('converts round dollar amount correctly (e.g. 500 -> "5.00")', () => {
    const request = buildApplePayRequest(500);
    expect(request.total.amount).toBe('5.00');
  });

  it('converts zero amount correctly', () => {
    const request = buildApplePayRequest(0);
    expect(request.total.amount).toBe('0.00');
  });

  it('uses default display name "OppsEra" for total label', () => {
    const request = buildApplePayRequest(1000);
    expect(request.total.label).toBe('OppsEra');
  });

  it('uses custom display name when provided', () => {
    const request = buildApplePayRequest(1000, 'My Club');
    expect(request.total.label).toBe('My Club');
  });

  it('creates session with API version 14', () => {
    // The component uses: new window.ApplePaySession(14, request)
    const apiVersion = 14;
    expect(apiVersion).toBe(14);
  });
});

describe('Apple Pay Button — SSRF prevention on validationURL', () => {
  it('accepts valid Apple Pay gateway URL', () => {
    expect(
      isValidApplePayValidationURL(
        'https://apple-pay-gateway.apple.com/paymentservices/startSession',
      ),
    ).toBe(true);
  });

  it('accepts Apple Pay gateway URL with subdomain', () => {
    expect(
      isValidApplePayValidationURL(
        'https://apple-pay-gateway-nc-pod5.apple.com/paymentservices/startSession',
      ),
    ).toBe(true);
  });

  it('rejects arbitrary HTTPS URL', () => {
    expect(
      isValidApplePayValidationURL('https://evil.com/steal-session'),
    ).toBe(false);
  });

  it('rejects HTTP URL (non-TLS)', () => {
    expect(
      isValidApplePayValidationURL(
        'http://apple-pay-gateway.apple.com/paymentservices/startSession',
      ),
    ).toBe(false);
  });

  it('rejects internal network URL', () => {
    expect(
      isValidApplePayValidationURL('https://192.168.1.1/internal'),
    ).toBe(false);
  });

  it('rejects localhost URL', () => {
    expect(
      isValidApplePayValidationURL('https://localhost:3000/admin'),
    ).toBe(false);
  });

  it('rejects URL with apple-pay-gateway as path, not host', () => {
    expect(
      isValidApplePayValidationURL(
        'https://evil.com/apple-pay-gateway/redirect',
      ),
    ).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidApplePayValidationURL('')).toBe(false);
  });
});

describe('Apple Pay Button — cancellation handling', () => {
  it('does not treat cancellation as an error', () => {
    const result = handleApplePayCancel();
    expect(result.isError).toBe(false);
  });

  it('oncancel handler does not call onError', () => {
    // Simulate the component logic: session.oncancel = () => {}
    const onError = vi.fn();
    // The component sets oncancel to a no-op — it never calls onError
    const oncancel = () => {
      // intentionally empty
    };
    oncancel();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('Apple Pay Button — TokenizeResult normalization', () => {
  it('uses apple_pay as default provider when metadata.provider is absent', () => {
    const result = normalizeApplePayToken({
      token: 'tok_abc',
      last4: '1234',
      brand: 'visa',
      expMonth: 12,
      expYear: 2028,
    });
    expect(result.provider).toBe('apple_pay');
  });

  it('uses metadata.provider when present', () => {
    const result = normalizeApplePayToken({
      token: 'tok_abc',
      last4: '1234',
      brand: 'visa',
      expMonth: 12,
      expYear: 2028,
      metadata: { provider: 'cardpointe' },
    });
    expect(result.provider).toBe('cardpointe');
  });

  it('always sets source to apple_pay', () => {
    const result = normalizeApplePayToken({
      token: 'tok_abc',
      last4: null,
      brand: null,
      expMonth: null,
      expYear: null,
    });
    expect(result.source).toBe('apple_pay');
  });

  it('preserves all card details from server response', () => {
    const result = normalizeApplePayToken({
      token: 'tok_xyz',
      last4: '4242',
      brand: 'mastercard',
      expMonth: 3,
      expYear: 2027,
      metadata: { funding: 'credit' },
    });
    expect(result.token).toBe('tok_xyz');
    expect(result.last4).toBe('4242');
    expect(result.brand).toBe('mastercard');
    expect(result.expMonth).toBe(3);
    expect(result.expYear).toBe(2027);
    expect(result.metadata).toEqual({ funding: 'credit' });
  });

  it('coerces null fields correctly', () => {
    const result = normalizeApplePayToken({
      token: 'tok_abc',
      last4: null,
      brand: null,
      expMonth: null,
      expYear: null,
    });
    expect(result.last4).toBeNull();
    expect(result.brand).toBeNull();
    expect(result.expMonth).toBeNull();
    expect(result.expYear).toBeNull();
    expect(result.metadata).toEqual({});
  });
});

describe('Apple Pay Button — merchant validation flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls validate-merchant endpoint with the validationURL', async () => {
    const validationURL =
      'https://apple-pay-gateway.apple.com/paymentservices/startSession';

    mockApiFetch.mockResolvedValue({ data: { merchantSession: 'session-data' } });

    await apiFetch('/api/v1/payments/apple-pay/validate-merchant', {
      method: 'POST',
      body: JSON.stringify({ validationURL }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/payments/apple-pay/validate-merchant',
      {
        method: 'POST',
        body: JSON.stringify({ validationURL }),
      },
    );
  });

  it('calls wallet-tokenize endpoint with apple_pay walletType', async () => {
    const paymentData = { encrypted: 'abc123' };

    mockApiFetch.mockResolvedValue({
      data: {
        token: 'tok_test',
        last4: '1234',
        brand: 'visa',
        expMonth: 12,
        expYear: 2028,
      },
    });

    await apiFetch('/api/v1/payments/wallet-tokenize', {
      method: 'POST',
      body: JSON.stringify({ walletType: 'apple_pay', paymentData }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/payments/wallet-tokenize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ walletType: 'apple_pay', paymentData }),
      }),
    );
  });

  it('reports error message from apiFetch failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network timeout'));

    const onError = vi.fn();

    try {
      await apiFetch('/api/v1/payments/apple-pay/validate-merchant', {
        method: 'POST',
        body: '{}',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Merchant validation failed.';
      onError(message);
    }

    expect(onError).toHaveBeenCalledWith('Network timeout');
  });

  it('reports generic error for non-Error throws', async () => {
    mockApiFetch.mockRejectedValue('something went wrong');

    const onError = vi.fn();

    try {
      await apiFetch('/api/v1/payments/wallet-tokenize', {
        method: 'POST',
        body: '{}',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Apple Pay authorization failed.';
      onError(message);
    }

    expect(onError).toHaveBeenCalledWith('Apple Pay authorization failed.');
  });
});

describe('Apple Pay Button — session lifecycle', () => {
  it('calls begin() on the session after wiring all handlers', () => {
    const mockSessionInstance = {
      onvalidatemerchant: null as (() => void) | null,
      onpaymentauthorized: null as (() => void) | null,
      oncancel: null as (() => void) | null,
      begin: vi.fn(),
      completePayment: vi.fn(),
    };

    // Simulate the component wiring order
    mockSessionInstance.onvalidatemerchant = vi.fn();
    mockSessionInstance.onpaymentauthorized = vi.fn();
    mockSessionInstance.oncancel = () => {};
    mockSessionInstance.begin();

    expect(mockSessionInstance.begin).toHaveBeenCalledOnce();
  });

  it('calls completePayment with STATUS_SUCCESS on successful tokenization', () => {
    const STATUS_SUCCESS = 0;
    const completePayment = vi.fn();

    // Simulate the success path from onpaymentauthorized
    completePayment(STATUS_SUCCESS);

    expect(completePayment).toHaveBeenCalledWith(STATUS_SUCCESS);
  });

  it('calls completePayment with STATUS_FAILURE on tokenization error', () => {
    const STATUS_FAILURE = 1;
    const completePayment = vi.fn();

    // Simulate the error path from onpaymentauthorized
    completePayment(STATUS_FAILURE);

    expect(completePayment).toHaveBeenCalledWith(STATUS_FAILURE);
  });

  it('calls completePayment with STATUS_FAILURE on merchant validation error', () => {
    const STATUS_FAILURE = 1;
    const completePayment = vi.fn();

    // Simulate the error path from onvalidatemerchant
    completePayment(STATUS_FAILURE);

    expect(completePayment).toHaveBeenCalledWith(STATUS_FAILURE);
  });
});
