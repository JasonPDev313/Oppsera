import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const tokenizeWalletData = vi.fn();
  const decryptCredentials = vi.fn();
  const withTenant = vi.fn();

  return {
    tokenizeWalletData,
    decryptCredentials,
    withTenant,
  };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  withTenant: mocks.withTenant,
  paymentProviders: { tenantId: 'tenant_id', isActive: 'is_active', code: 'code' },
  paymentProviderCredentials: {
    tenantId: 'tenant_id',
    providerId: 'provider_id',
    locationId: 'location_id',
    isActive: 'is_active',
    credentialsEncrypted: 'credentials_encrypted',
  },
  paymentMerchantAccounts: {
    tenantId: 'tenant_id',
    providerId: 'provider_id',
    locationId: 'location_id',
    isDefault: 'is_default',
    isActive: 'is_active',
    merchantId: 'merchant_id',
  },
  terminalMerchantAssignments: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((a) => ({ type: 'isNull', a })),
}));

vi.mock('@oppsera/core', () => ({
  publishWithOutbox: vi.fn(),
  buildEventFromContext: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: vi.fn((handler: Function) => handler),
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, status = 400) {
      super(message); this.code = code; this.statusCode = status;
    }
  },
  ValidationError: class extends Error {
    code = 'VALIDATION_ERROR'; statusCode = 400; details: unknown[];
    constructor(message: string, details: unknown[] = []) {
      super(message); this.details = details;
    }
  },
}));

// ── Constants matching the route logic ─────────────────────────────

const MAX_APPLE_PAY_TOKEN_AGE_MS = 2 * 60 * 1000; // 2 minutes

// ── Validation helpers extracted from route logic ──────────────────
// These mirror the inline validation in the wallet-tokenize route handler
// so we can unit test them without spinning up Next.js request/response.

type WalletType = 'apple_pay' | 'google_pay';

interface WalletTokenizeInput {
  walletType: string;
  paymentData: unknown;
}

interface TokenizeResult {
  provider: string;
  token: string;
  last4: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
  source: WalletType;
  metadata: Record<string, unknown>;
}

function validateWalletType(walletType: unknown): walletType is WalletType {
  return walletType === 'apple_pay' || walletType === 'google_pay';
}

function validatePaymentData(paymentData: unknown): paymentData is Record<string, unknown> {
  return !!paymentData && typeof paymentData === 'object' && !Array.isArray(paymentData);
}

function checkApplePayTokenExpiry(
  paymentData: Record<string, unknown>,
): { expired: boolean; ageMs?: number } {
  const header = paymentData.header as Record<string, unknown> | undefined;
  const transactionTime = header?.transactionTime;
  if (transactionTime && typeof transactionTime === 'number') {
    const ageMs = Date.now() - transactionTime;
    if (ageMs > MAX_APPLE_PAY_TOKEN_AGE_MS) {
      return { expired: true, ageMs };
    }
  }
  return { expired: false };
}

function buildTokenizeResult(
  walletType: WalletType,
  token: string,
): TokenizeResult {
  return {
    provider: 'cardpointe',
    token,
    last4: null,
    brand: null,
    expMonth: null,
    expYear: null,
    source: walletType,
    metadata: { walletType },
  };
}

function resolveEncryptionHandler(walletType: WalletType): string | undefined {
  if (walletType === 'google_pay') return 'EC_GOOGLE_PAY';
  return undefined;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('wallet-tokenize: walletType validation', () => {
  it('should accept apple_pay as a valid wallet type', () => {
    expect(validateWalletType('apple_pay')).toBe(true);
  });

  it('should accept google_pay as a valid wallet type', () => {
    expect(validateWalletType('google_pay')).toBe(true);
  });

  it('should reject samsung_pay', () => {
    expect(validateWalletType('samsung_pay')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(validateWalletType('')).toBe(false);
  });

  it('should reject null', () => {
    expect(validateWalletType(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(validateWalletType(undefined)).toBe(false);
  });

  it('should reject numeric value', () => {
    expect(validateWalletType(123)).toBe(false);
  });

  it('should reject APPLE_PAY (case-sensitive)', () => {
    expect(validateWalletType('APPLE_PAY')).toBe(false);
  });

  it('should reject Google_Pay (case-sensitive)', () => {
    expect(validateWalletType('Google_Pay')).toBe(false);
  });
});

describe('wallet-tokenize: paymentData validation', () => {
  it('should accept a plain object', () => {
    expect(validatePaymentData({ token: 'abc' })).toBe(true);
  });

  it('should accept an empty object', () => {
    expect(validatePaymentData({})).toBe(true);
  });

  it('should accept a nested object', () => {
    expect(validatePaymentData({ header: { transactionTime: 123 } })).toBe(true);
  });

  it('should reject null', () => {
    expect(validatePaymentData(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(validatePaymentData(undefined)).toBe(false);
  });

  it('should reject a string', () => {
    expect(validatePaymentData('not-an-object')).toBe(false);
  });

  it('should reject a number', () => {
    expect(validatePaymentData(42)).toBe(false);
  });

  it('should reject a boolean', () => {
    expect(validatePaymentData(true)).toBe(false);
  });

  it('should reject an array', () => {
    expect(validatePaymentData([1, 2, 3])).toBe(false);
  });
});

describe('wallet-tokenize: Apple Pay token expiry enforcement', () => {
  it('should reject Apple Pay tokens older than 2 minutes', () => {
    const oldTimestamp = Date.now() - (3 * 60 * 1000); // 3 minutes ago
    const paymentData = {
      header: { transactionTime: oldTimestamp },
    };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(true);
    expect(result.ageMs).toBeGreaterThan(MAX_APPLE_PAY_TOKEN_AGE_MS);
  });

  it('should reject Apple Pay tokens exactly at the 2-minute boundary', () => {
    // Token at exactly 2 min + 1ms age to exceed the boundary
    const borderTimestamp = Date.now() - MAX_APPLE_PAY_TOKEN_AGE_MS - 1;
    const paymentData = {
      header: { transactionTime: borderTimestamp },
    };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(true);
  });

  it('should accept Apple Pay tokens younger than 2 minutes', () => {
    const recentTimestamp = Date.now() - (60 * 1000); // 1 minute ago
    const paymentData = {
      header: { transactionTime: recentTimestamp },
    };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(false);
  });

  it('should accept Apple Pay tokens created just now', () => {
    const paymentData = {
      header: { transactionTime: Date.now() },
    };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(false);
  });

  it('should skip expiry check when header is missing', () => {
    const paymentData = {};
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(false);
  });

  it('should skip expiry check when transactionTime is missing', () => {
    const paymentData = { header: {} };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(false);
  });

  it('should skip expiry check when transactionTime is a string', () => {
    const paymentData = {
      header: { transactionTime: '2026-01-15T12:00:00Z' },
    };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(false);
  });

  it('should reject tokens with transactionTime far in the past', () => {
    const veryOldTimestamp = Date.now() - (60 * 60 * 1000); // 1 hour ago
    const paymentData = {
      header: { transactionTime: veryOldTimestamp },
    };
    const result = checkApplePayTokenExpiry(paymentData);
    expect(result.expired).toBe(true);
  });
});

describe('wallet-tokenize: Google Pay encryption handler', () => {
  it('should return EC_GOOGLE_PAY for google_pay wallet type', () => {
    expect(resolveEncryptionHandler('google_pay')).toBe('EC_GOOGLE_PAY');
  });

  it('should return undefined for apple_pay (no encryption handler needed)', () => {
    expect(resolveEncryptionHandler('apple_pay')).toBeUndefined();
  });
});

describe('wallet-tokenize: TokenizeResult normalization', () => {
  it('should produce a result with source = apple_pay for Apple Pay', () => {
    const result = buildTokenizeResult('apple_pay', 'tok-apple-123');
    expect(result.source).toBe('apple_pay');
    expect(result.provider).toBe('cardpointe');
    expect(result.token).toBe('tok-apple-123');
    expect(result.metadata).toEqual({ walletType: 'apple_pay' });
  });

  it('should produce a result with source = google_pay for Google Pay', () => {
    const result = buildTokenizeResult('google_pay', 'tok-google-456');
    expect(result.source).toBe('google_pay');
    expect(result.provider).toBe('cardpointe');
    expect(result.token).toBe('tok-google-456');
    expect(result.metadata).toEqual({ walletType: 'google_pay' });
  });

  it('should have null card-detail fields for wallet tokens', () => {
    const result = buildTokenizeResult('apple_pay', 'tok-abc');
    expect(result.last4).toBeNull();
    expect(result.brand).toBeNull();
    expect(result.expMonth).toBeNull();
    expect(result.expYear).toBeNull();
  });

  it('should conform to the TokenizeResult shape', () => {
    const result = buildTokenizeResult('google_pay', 'tok-xyz');
    // Verify all required fields are present
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('last4');
    expect(result).toHaveProperty('brand');
    expect(result).toHaveProperty('expMonth');
    expect(result).toHaveProperty('expYear');
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('metadata');
    // Verify types
    expect(typeof result.provider).toBe('string');
    expect(typeof result.token).toBe('string');
    expect(typeof result.source).toBe('string');
    expect(typeof result.metadata).toBe('object');
  });
});

describe('wallet-tokenize: Base64 encoding of paymentData', () => {
  it('should produce valid Base64 for Apple Pay payment data', () => {
    const paymentData = {
      version: 'EC_v1',
      data: 'encrypted-token-data',
      signature: 'sig-data',
      header: {
        transactionTime: Date.now(),
        publicKeyHash: 'hash-abc',
      },
    };
    const encoded = Buffer.from(JSON.stringify(paymentData)).toString('base64');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    expect(decoded).toEqual(paymentData);
  });

  it('should produce valid Base64 for Google Pay payment data', () => {
    const paymentData = {
      protocolVersion: 'ECv2',
      signature: 'MEUCIFtest==',
      intermediateSigningKey: { signedKey: 'signed-key-data' },
      signedMessage: '{"encryptedMessage":"enc","tag":"tag","ephemeralPublicKey":"pk"}',
    };
    const encoded = Buffer.from(JSON.stringify(paymentData)).toString('base64');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    expect(decoded).toEqual(paymentData);
  });
});

describe('wallet-tokenize: end-to-end validation flow', () => {
  it('should reject request with invalid walletType and non-object paymentData together', () => {
    const walletType = 'paypal';
    const paymentData = 'not-an-object';
    // walletType validation is checked first
    expect(validateWalletType(walletType)).toBe(false);
    expect(validatePaymentData(paymentData)).toBe(false);
  });

  it('should pass full validation for a valid apple_pay request', () => {
    const walletType = 'apple_pay';
    const paymentData = {
      version: 'EC_v1',
      data: 'encrypted',
      header: { transactionTime: Date.now() },
    };
    expect(validateWalletType(walletType)).toBe(true);
    expect(validatePaymentData(paymentData)).toBe(true);
    expect(checkApplePayTokenExpiry(paymentData).expired).toBe(false);
    expect(resolveEncryptionHandler(walletType)).toBeUndefined();
  });

  it('should pass full validation for a valid google_pay request', () => {
    const walletType = 'google_pay';
    const paymentData = {
      protocolVersion: 'ECv2',
      signedMessage: '{}',
    };
    expect(validateWalletType(walletType)).toBe(true);
    expect(validatePaymentData(paymentData)).toBe(true);
    expect(resolveEncryptionHandler(walletType)).toBe('EC_GOOGLE_PAY');
  });

  it('should reject apple_pay with expired token', () => {
    const walletType = 'apple_pay';
    const paymentData = {
      header: { transactionTime: Date.now() - (5 * 60 * 1000) }, // 5 min ago
    };
    expect(validateWalletType(walletType)).toBe(true);
    expect(validatePaymentData(paymentData)).toBe(true);
    expect(checkApplePayTokenExpiry(paymentData).expired).toBe(true);
  });
});
