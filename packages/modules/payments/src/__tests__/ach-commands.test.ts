import { describe, it, expect, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────

vi.mock('@oppsera/db', () => {
  const mockTx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
          orderBy: vi.fn().mockReturnValue([]),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([]),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([{
          id: 'md-new',
          amount1Cents: 42,
          amount2Cents: 77,
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue([]),
        }),
      }),
    }),
  };

  return {
    withTenant: vi.fn((_tenantId: string, fn: (...args: any[]) => any) => fn(mockTx)),
    paymentIntents: { tenantId: 'tenant_id', id: 'id', status: 'status', paymentMethodType: 'payment_method_type' },
    paymentTransactions: { tenantId: 'tenant_id', paymentIntentId: 'payment_intent_id', providerRef: 'provider_ref' },
    paymentProviders: {},
    paymentProviderCredentials: {},
    paymentMerchantAccounts: {},
    terminalMerchantAssignments: {},
    customerPaymentMethods: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', status: 'status', paymentType: 'payment_type', providerProfileId: 'provider_profile_id', verificationStatus: 'verification_status', isDefault: 'is_default' },
    achReturns: { id: 'id', tenantId: 'tenant_id', paymentIntentId: 'payment_intent_id', returnCode: 'return_code' },
    achMicroDeposits: { id: 'id', tenantId: 'tenant_id', paymentMethodId: 'payment_method_id', status: 'status' },
    tenders: { id: 'id', tenantId: 'tenant_id', paymentIntentId: 'payment_intent_id' },
  };
});

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (...args: any[]) => any) => fn({})),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx: any, type: string, payload: any) => ({
    type,
    payload,
    id: 'event-1',
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

// ── Imports (after mocks) ───────────────────────────────────

import {
  tokenizeBankAccountSchema,
  addBankAccountSchema,
  verifyMicroDepositsSchema,
  updateMerchantAccountAchSchema,
  authorizePaymentSchema,
  salePaymentSchema,
} from '../gateway-validation';

import {
  assertIntentTransition,
  INTENT_STATUS_TRANSITIONS,
  PAYMENT_GATEWAY_EVENTS,
} from '../events/gateway-types';
import type { PaymentIntentStatus } from '../events/gateway-types';

// ── ACH Validation Schemas ─────────────────────────────────────

describe('tokenizeBankAccountSchema', () => {
  const valid = {
    routingNumber: '021000021',
    accountNumber: '1234567890',
    accountType: 'checking' as const,
  };

  it('should accept valid checking account', () => {
    expect(tokenizeBankAccountSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept valid savings account', () => {
    const result = tokenizeBankAccountSchema.safeParse({ ...valid, accountType: 'savings' });
    expect(result.success).toBe(true);
  });

  it('should reject non-9-digit routing number', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, routingNumber: '12345678' }).success).toBe(false);
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, routingNumber: '1234567890' }).success).toBe(false);
  });

  it('should reject routing number with letters', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, routingNumber: '12345678a' }).success).toBe(false);
  });

  it('should reject account number shorter than 4 digits', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, accountNumber: '123' }).success).toBe(false);
  });

  it('should reject account number longer than 17 digits', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, accountNumber: '1'.repeat(18) }).success).toBe(false);
  });

  it('should accept minimum-length account number (4 digits)', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, accountNumber: '1234' }).success).toBe(true);
  });

  it('should accept maximum-length account number (17 digits)', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, accountNumber: '1'.repeat(17) }).success).toBe(true);
  });

  it('should reject account number with letters', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, accountNumber: '123456789a' }).success).toBe(false);
  });

  it('should reject invalid account type', () => {
    expect(tokenizeBankAccountSchema.safeParse({ ...valid, accountType: 'credit' }).success).toBe(false);
  });

  it('should reject missing routing number', () => {
    const { routingNumber: _routingNumber, ...rest } = valid;
    expect(tokenizeBankAccountSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject missing account number', () => {
    const { accountNumber: _accountNumber, ...rest } = valid;
    expect(tokenizeBankAccountSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject missing account type', () => {
    const { accountType: _accountType, ...rest } = valid;
    expect(tokenizeBankAccountSchema.safeParse(rest).success).toBe(false);
  });
});

describe('addBankAccountSchema', () => {
  const valid = {
    clientRequestId: 'add-bank-001',
    customerId: 'cust-1',
    token: 'tok-bank-123',
    routingLast4: '0021',
    accountLast4: '7890',
    accountType: 'checking' as const,
  };

  it('should accept valid input', () => {
    expect(addBankAccountSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept optional fields', () => {
    const result = addBankAccountSchema.safeParse({
      ...valid,
      bankName: 'Chase',
      nickname: 'Primary Checking',
      isDefault: true,
      skipVerification: true,
    });
    expect(result.success).toBe(true);
  });

  it('should default isDefault to false', () => {
    const parsed = addBankAccountSchema.parse(valid);
    expect(parsed.isDefault).toBe(false);
  });

  it('should default skipVerification to false', () => {
    const parsed = addBankAccountSchema.parse(valid);
    expect(parsed.skipVerification).toBe(false);
  });

  it('should reject routingLast4 not exactly 4 chars', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, routingLast4: '002' }).success).toBe(false);
    expect(addBankAccountSchema.safeParse({ ...valid, routingLast4: '00210' }).success).toBe(false);
  });

  it('should reject accountLast4 not exactly 4 chars', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, accountLast4: '789' }).success).toBe(false);
    expect(addBankAccountSchema.safeParse({ ...valid, accountLast4: '78901' }).success).toBe(false);
  });

  it('should reject empty clientRequestId', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, clientRequestId: '' }).success).toBe(false);
  });

  it('should reject clientRequestId over 128 chars', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, clientRequestId: 'x'.repeat(129) }).success).toBe(false);
  });

  it('should reject empty customerId', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, customerId: '' }).success).toBe(false);
  });

  it('should reject empty token', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, token: '' }).success).toBe(false);
  });

  it('should reject bankName over 100 chars', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, bankName: 'x'.repeat(101) }).success).toBe(false);
  });

  it('should reject nickname over 50 chars', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, nickname: 'x'.repeat(51) }).success).toBe(false);
  });

  it('should accept savings account type', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, accountType: 'savings' }).success).toBe(true);
  });

  it('should reject invalid account type', () => {
    expect(addBankAccountSchema.safeParse({ ...valid, accountType: 'credit' }).success).toBe(false);
  });
});

describe('verifyMicroDepositsSchema', () => {
  const valid = {
    paymentMethodId: 'pm-1',
    amount1Cents: 42,
    amount2Cents: 77,
  };

  it('should accept valid input', () => {
    expect(verifyMicroDepositsSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept minimum amounts (1 cent)', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount1Cents: 1, amount2Cents: 1 }).success).toBe(true);
  });

  it('should accept maximum amounts (99 cents)', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount1Cents: 99, amount2Cents: 99 }).success).toBe(true);
  });

  it('should reject amount of 0', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount1Cents: 0 }).success).toBe(false);
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount2Cents: 0 }).success).toBe(false);
  });

  it('should reject amount over 99', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount1Cents: 100 }).success).toBe(false);
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount2Cents: 100 }).success).toBe(false);
  });

  it('should reject non-integer amounts', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount1Cents: 42.5 }).success).toBe(false);
  });

  it('should reject negative amounts', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, amount1Cents: -1 }).success).toBe(false);
  });

  it('should reject empty paymentMethodId', () => {
    expect(verifyMicroDepositsSchema.safeParse({ ...valid, paymentMethodId: '' }).success).toBe(false);
  });
});

describe('updateMerchantAccountAchSchema', () => {
  const valid = {
    merchantAccountId: 'ma-1',
  };

  it('should accept minimal input (merchantAccountId only)', () => {
    expect(updateMerchantAccountAchSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept full ACH settings', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      ...valid,
      achEnabled: true,
      achDefaultSecCode: 'WEB',
      achCompanyName: 'ACME Corp',
      achCompanyId: 'ACME123',
      achVerificationMode: 'micro_deposit',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all SEC codes', () => {
    for (const code of ['CCD', 'PPD', 'TEL', 'WEB']) {
      expect(updateMerchantAccountAchSchema.safeParse({ ...valid, achDefaultSecCode: code }).success).toBe(true);
    }
  });

  it('should reject invalid SEC code', () => {
    expect(updateMerchantAccountAchSchema.safeParse({ ...valid, achDefaultSecCode: 'IAT' }).success).toBe(false);
  });

  it('should accept all verification modes', () => {
    for (const mode of ['none', 'account_validation', 'micro_deposit']) {
      expect(updateMerchantAccountAchSchema.safeParse({ ...valid, achVerificationMode: mode }).success).toBe(true);
    }
  });

  it('should reject invalid verification mode', () => {
    expect(updateMerchantAccountAchSchema.safeParse({ ...valid, achVerificationMode: 'plaid' }).success).toBe(false);
  });

  it('should reject empty merchantAccountId', () => {
    expect(updateMerchantAccountAchSchema.safeParse({ merchantAccountId: '' }).success).toBe(false);
  });

  it('should reject achCompanyName over 100 chars', () => {
    expect(updateMerchantAccountAchSchema.safeParse({ ...valid, achCompanyName: 'x'.repeat(101) }).success).toBe(false);
  });

  it('should reject achCompanyId over 50 chars', () => {
    expect(updateMerchantAccountAchSchema.safeParse({ ...valid, achCompanyId: 'x'.repeat(51) }).success).toBe(false);
  });
});

// ── ACH-specific fields on payment schemas ───────────────────

describe('authorizePaymentSchema (ACH fields)', () => {
  const validCard = {
    clientRequestId: 'auth-001',
    amountCents: 5000,
    token: '9418594164541111',
    expiry: '1225',
  };

  it('should accept ACH payment with achSecCode', () => {
    const result = authorizePaymentSchema.safeParse({
      ...validCard,
      paymentMethodType: 'ach',
      achSecCode: 'WEB',
      achAccountType: 'ECHK',
    });
    expect(result.success).toBe(true);
  });

  it('should require achSecCode for ACH payments', () => {
    const result = authorizePaymentSchema.safeParse({
      ...validCard,
      paymentMethodType: 'ach',
      achAccountType: 'ECHK',
      // achSecCode missing
    });
    expect(result.success).toBe(false);
  });

  it('should not require achSecCode for card payments', () => {
    const result = authorizePaymentSchema.safeParse(validCard);
    expect(result.success).toBe(true);
  });

  it('should accept all valid ACH account types', () => {
    for (const type of ['ECHK', 'ESAV']) {
      const result = authorizePaymentSchema.safeParse({
        ...validCard,
        paymentMethodType: 'ach',
        achSecCode: 'WEB',
        achAccountType: type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid SEC codes', () => {
    for (const code of ['CCD', 'PPD', 'TEL', 'WEB']) {
      const result = authorizePaymentSchema.safeParse({
        ...validCard,
        paymentMethodType: 'ach',
        achSecCode: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept achDescription', () => {
    const result = authorizePaymentSchema.safeParse({
      ...validCard,
      paymentMethodType: 'ach',
      achSecCode: 'WEB',
      achDescription: 'Monthly dues',
    });
    expect(result.success).toBe(true);
  });

  it('should reject achDescription over 100 chars', () => {
    const result = authorizePaymentSchema.safeParse({
      ...validCard,
      paymentMethodType: 'ach',
      achSecCode: 'WEB',
      achDescription: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe('salePaymentSchema (ACH fields)', () => {
  const validCard = {
    clientRequestId: 'sale-001',
    amountCents: 1000,
    token: '9418594164541111',
  };

  it('should accept ACH sale with required fields', () => {
    const result = salePaymentSchema.safeParse({
      ...validCard,
      paymentMethodType: 'ach',
      achSecCode: 'PPD',
    });
    expect(result.success).toBe(true);
  });

  it('should require achSecCode for ACH sale', () => {
    const result = salePaymentSchema.safeParse({
      ...validCard,
      paymentMethodType: 'ach',
    });
    expect(result.success).toBe(false);
  });

  it('should default surchargeAmountCents to 0', () => {
    const parsed = salePaymentSchema.parse(validCard);
    expect(parsed.surchargeAmountCents).toBe(0);
  });
});

// ── ACH Intent Status Transitions ──────────────────────────────

describe('ACH intent status transitions', () => {
  it('should allow created → ach_pending', () => {
    expect(() => assertIntentTransition('created', 'ach_pending')).not.toThrow();
  });

  it('should allow ach_pending → ach_originated', () => {
    expect(() => assertIntentTransition('ach_pending', 'ach_originated')).not.toThrow();
  });

  it('should allow ach_pending → ach_returned', () => {
    expect(() => assertIntentTransition('ach_pending', 'ach_returned')).not.toThrow();
  });

  it('should allow ach_pending → voided', () => {
    expect(() => assertIntentTransition('ach_pending', 'voided')).not.toThrow();
  });

  it('should allow ach_pending → error', () => {
    expect(() => assertIntentTransition('ach_pending', 'error')).not.toThrow();
  });

  it('should allow ach_originated → ach_settled', () => {
    expect(() => assertIntentTransition('ach_originated', 'ach_settled')).not.toThrow();
  });

  it('should allow ach_originated → ach_returned', () => {
    expect(() => assertIntentTransition('ach_originated', 'ach_returned')).not.toThrow();
  });

  it('should allow ach_originated → error', () => {
    expect(() => assertIntentTransition('ach_originated', 'error')).not.toThrow();
  });

  it('should allow ach_settled → ach_returned (late returns)', () => {
    expect(() => assertIntentTransition('ach_settled', 'ach_returned')).not.toThrow();
  });

  it('should allow ach_returned → resolved', () => {
    expect(() => assertIntentTransition('ach_returned', 'resolved')).not.toThrow();
  });

  // Invalid transitions
  it('should reject ach_pending → captured', () => {
    expect(() => assertIntentTransition('ach_pending', 'captured')).toThrow();
  });

  it('should reject ach_pending → authorized', () => {
    expect(() => assertIntentTransition('ach_pending', 'authorized')).toThrow();
  });

  it('should reject ach_originated → captured', () => {
    expect(() => assertIntentTransition('ach_originated', 'captured')).toThrow();
  });

  it('should reject ach_settled → voided', () => {
    expect(() => assertIntentTransition('ach_settled', 'voided')).toThrow();
  });

  it('should reject ach_returned → ach_settled', () => {
    expect(() => assertIntentTransition('ach_returned', 'ach_settled')).toThrow();
  });

  it('should reject ach_returned → ach_originated', () => {
    expect(() => assertIntentTransition('ach_returned', 'ach_originated')).toThrow();
  });

  it('ach_settled should only allow ach_returned', () => {
    const allowed = INTENT_STATUS_TRANSITIONS['ach_settled'];
    expect(allowed).toEqual(['ach_returned']);
  });

  it('ach_returned should only allow resolved', () => {
    const allowed = INTENT_STATUS_TRANSITIONS['ach_returned'];
    expect(allowed).toEqual(['resolved']);
  });
});

// ── ACH Event Constants ────────────────────────────────────────

describe('ACH event constants', () => {
  it('should have ACH_ORIGINATED event', () => {
    expect(PAYMENT_GATEWAY_EVENTS.ACH_ORIGINATED).toBe('payment.gateway.ach_originated.v1');
  });

  it('should have ACH_SETTLED event', () => {
    expect(PAYMENT_GATEWAY_EVENTS.ACH_SETTLED).toBe('payment.gateway.ach_settled.v1');
  });

  it('should have ACH_RETURNED event', () => {
    expect(PAYMENT_GATEWAY_EVENTS.ACH_RETURNED).toBe('payment.gateway.ach_returned.v1');
  });

  it('should have PROFILE_CREATED event (used by addBankAccount)', () => {
    expect(PAYMENT_GATEWAY_EVENTS.PROFILE_CREATED).toBe('payment.gateway.profile_created.v1');
  });
});

// ── ACH Status Lifecycle Completeness ──────────────────────────

describe('ACH status lifecycle', () => {
  const achStatuses: PaymentIntentStatus[] = ['ach_pending', 'ach_originated', 'ach_settled', 'ach_returned'];

  it('all ACH statuses should exist in INTENT_STATUS_TRANSITIONS', () => {
    for (const status of achStatuses) {
      expect(INTENT_STATUS_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('ach_pending should have 4 valid transitions', () => {
    expect(INTENT_STATUS_TRANSITIONS['ach_pending']).toHaveLength(4);
  });

  it('ach_originated should have 3 valid transitions', () => {
    expect(INTENT_STATUS_TRANSITIONS['ach_originated']).toHaveLength(3);
  });

  it('ach_settled should have exactly 1 transition (ach_returned)', () => {
    expect(INTENT_STATUS_TRANSITIONS['ach_settled']).toHaveLength(1);
    expect(INTENT_STATUS_TRANSITIONS['ach_settled'][0]).toBe('ach_returned');
  });

  it('ach_returned should have exactly 1 transition (resolved)', () => {
    expect(INTENT_STATUS_TRANSITIONS['ach_returned']).toHaveLength(1);
    expect(INTENT_STATUS_TRANSITIONS['ach_returned'][0]).toBe('resolved');
  });

  it('created status should include ach_pending as valid transition', () => {
    expect(INTENT_STATUS_TRANSITIONS['created']).toContain('ach_pending');
  });

  it('ACH happy path should be valid: created → ach_pending → ach_originated → ach_settled', () => {
    expect(() => assertIntentTransition('created', 'ach_pending')).not.toThrow();
    expect(() => assertIntentTransition('ach_pending', 'ach_originated')).not.toThrow();
    expect(() => assertIntentTransition('ach_originated', 'ach_settled')).not.toThrow();
  });

  it('ACH early return path should be valid: created → ach_pending → ach_returned → resolved', () => {
    expect(() => assertIntentTransition('created', 'ach_pending')).not.toThrow();
    expect(() => assertIntentTransition('ach_pending', 'ach_returned')).not.toThrow();
    expect(() => assertIntentTransition('ach_returned', 'resolved')).not.toThrow();
  });

  it('ACH late return path should be valid: ach_settled → ach_returned → resolved', () => {
    expect(() => assertIntentTransition('ach_settled', 'ach_returned')).not.toThrow();
    expect(() => assertIntentTransition('ach_returned', 'resolved')).not.toThrow();
  });
});
