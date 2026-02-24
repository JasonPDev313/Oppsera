import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ACH API Route Contract Tests
 *
 * Tests Zod schema validation for all ACH-related endpoints,
 * event payload shapes, status transitions, return code classification,
 * and type contracts (TransactionListItem, TransactionDetail, PollAchFundingResult).
 *
 * No DB mocking needed — schemas and helpers are pure functions.
 */

// ── Direct imports (pure functions, no DB) ───────────────────────

import {
  tokenizeBankAccountSchema,
  addBankAccountSchema,
  verifyMicroDepositsSchema,
  updateMerchantAccountAchSchema,
  authorizePaymentSchema,
  salePaymentSchema,
  refundPaymentSchema,
  searchTransactionsSchema,
  PAYMENT_GATEWAY_EVENTS,
  INTENT_STATUS_TRANSITIONS,
  VALID_INTENT_STATUSES,
  assertIntentTransition,
  getReturnCode,
  isRetryableReturn,
  getRetryDelayDays,
  classifyReturn,
  getReturnDescription,
  isAdministrativeReturn,
  ALL_RETURN_CODES,
} from '@oppsera/module-payments';

import type {
  TransactionListItem,
  TransactionDetail,
  TransactionRecord,
  PollAchFundingInput,
  PollAchFundingResult,
  AchOriginatedPayload,
  AchSettledPayload,
  AchReturnedPayload,
  AchSettlementStatus,
  // PaymentIntentStatus,
  ProcessAchReturnInput,
  ProcessAchReturnResult,
  AchStatusSummary,
  AchPendingItem,
  AchReturnItem,
  AchReturnCodeDistribution,
  AchSettlementByDate,
  GetAchStatusInput,
} from '@oppsera/module-payments';

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// 1. tokenizeBankAccountSchema
// ═══════════════════════════════════════════════════════════════

describe('tokenizeBankAccountSchema', () => {
  it('accepts valid routing + account + checking type', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '123456789',
      accountType: 'checking',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.routingNumber).toBe('021000021');
      expect(result.data.accountNumber).toBe('123456789');
      expect(result.data.accountType).toBe('checking');
    }
  });

  it('accepts valid routing + account + savings type', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '111000025',
      accountNumber: '9876',
      accountType: 'savings',
    });
    expect(result.success).toBe(true);
  });

  it('accepts account number at minimum length (4 digits)', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '1234',
      accountType: 'checking',
    });
    expect(result.success).toBe(true);
  });

  it('accepts account number at maximum length (17 digits)', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '12345678901234567',
      accountType: 'checking',
    });
    expect(result.success).toBe(true);
  });

  it('rejects routing number shorter than 9 digits', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '02100002',
      accountNumber: '123456789',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects routing number longer than 9 digits', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '0210000210',
      accountNumber: '123456789',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects routing number with non-digits', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '02100002A',
      accountNumber: '123456789',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects account number shorter than 4 digits', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '123',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects account number longer than 17 digits', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '123456789012345678',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid account type', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '123456789',
      accountType: 'money_market',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing routingNumber', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      accountNumber: '123456789',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing accountNumber', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountType: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing accountType', () => {
    const result = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '123456789',
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. addBankAccountSchema
// ═══════════════════════════════════════════════════════════════

describe('addBankAccountSchema', () => {
  const validInput = {
    clientRequestId: 'req-add-bank-001',
    customerId: 'cust_001',
    token: '9401234567890123',
    routingLast4: '0021',
    accountLast4: '6789',
    accountType: 'checking' as const,
  };

  it('accepts valid bank account input with required fields', () => {
    const result = addBankAccountSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts optional fields (nickname, bankName, isDefault, skipVerification)', () => {
    const result = addBankAccountSchema.safeParse({
      ...validInput,
      nickname: 'Business Checking',
      bankName: 'Chase',
      isDefault: true,
      skipVerification: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nickname).toBe('Business Checking');
      expect(result.data.bankName).toBe('Chase');
      expect(result.data.isDefault).toBe(true);
      expect(result.data.skipVerification).toBe(true);
    }
  });

  it('defaults isDefault to false when not provided', () => {
    const result = addBankAccountSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(false);
    }
  });

  it('defaults skipVerification to false when not provided', () => {
    const result = addBankAccountSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skipVerification).toBe(false);
    }
  });

  it('requires token', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token, ...rest } = validInput;
    const result = addBankAccountSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('requires accountType', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accountType, ...rest } = validInput;
    const result = addBankAccountSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('requires customerId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customerId, ...rest } = validInput;
    const result = addBankAccountSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('requires clientRequestId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { clientRequestId, ...rest } = validInput;
    const result = addBankAccountSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('requires routingLast4 to be exactly 4 characters', () => {
    const result = addBankAccountSchema.safeParse({ ...validInput, routingLast4: '002' });
    expect(result.success).toBe(false);

    const result2 = addBankAccountSchema.safeParse({ ...validInput, routingLast4: '00211' });
    expect(result2.success).toBe(false);
  });

  it('requires accountLast4 to be exactly 4 characters', () => {
    const result = addBankAccountSchema.safeParse({ ...validInput, accountLast4: '678' });
    expect(result.success).toBe(false);

    const result2 = addBankAccountSchema.safeParse({ ...validInput, accountLast4: '67891' });
    expect(result2.success).toBe(false);
  });

  it('accepts savings account type', () => {
    const result = addBankAccountSchema.safeParse({ ...validInput, accountType: 'savings' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid account type', () => {
    const result = addBankAccountSchema.safeParse({ ...validInput, accountType: 'brokerage' });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. verifyMicroDepositsSchema
// ═══════════════════════════════════════════════════════════════

describe('verifyMicroDepositsSchema', () => {
  it('accepts valid amounts (1-99 cents)', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 12,
      amount2Cents: 34,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimum amounts (1 cent)', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 1,
      amount2Cents: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts maximum amounts (99 cents)', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 99,
      amount2Cents: 99,
    });
    expect(result.success).toBe(true);
  });

  it('rejects amount1Cents of 0', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 0,
      amount2Cents: 34,
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount2Cents of 0', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 12,
      amount2Cents: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount1Cents over 99', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 100,
      amount2Cents: 34,
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount2Cents over 99', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 12,
      amount2Cents: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative amounts', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: -5,
      amount2Cents: 34,
    });
    expect(result.success).toBe(false);
  });

  it('requires paymentMethodId', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      amount1Cents: 12,
      amount2Cents: 34,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer amounts', () => {
    const result = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 12.5,
      amount2Cents: 34,
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. updateMerchantAccountAchSchema
// ═══════════════════════════════════════════════════════════════

describe('updateMerchantAccountAchSchema', () => {
  it('accepts valid ACH settings with all fields', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      merchantAccountId: 'ma_001',
      achEnabled: true,
      achDefaultSecCode: 'WEB',
      achCompanyName: 'Acme Inc',
      achCompanyId: 'ACME001',
      achVerificationMode: 'micro_deposit',
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial update (only achEnabled)', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      merchantAccountId: 'ma_001',
      achEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('requires merchantAccountId', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      achEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('validates SEC code enum values (CCD, PPD, TEL, WEB)', () => {
    for (const code of ['CCD', 'PPD', 'TEL', 'WEB']) {
      const result = updateMerchantAccountAchSchema.safeParse({
        merchantAccountId: 'ma_001',
        achDefaultSecCode: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid SEC code', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      merchantAccountId: 'ma_001',
      achDefaultSecCode: 'RCK',
    });
    expect(result.success).toBe(false);
  });

  it('validates verification mode enum (none, account_validation, micro_deposit)', () => {
    for (const mode of ['none', 'account_validation', 'micro_deposit']) {
      const result = updateMerchantAccountAchSchema.safeParse({
        merchantAccountId: 'ma_001',
        achVerificationMode: mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid verification mode', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      merchantAccountId: 'ma_001',
      achVerificationMode: 'plaid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts achCompanyName up to 100 chars', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      merchantAccountId: 'ma_001',
      achCompanyName: 'A'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it('rejects achCompanyName over 100 chars', () => {
    const result = updateMerchantAccountAchSchema.safeParse({
      merchantAccountId: 'ma_001',
      achCompanyName: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. searchTransactionsSchema — ACH filter tests
// ═══════════════════════════════════════════════════════════════

describe('searchTransactionsSchema — ACH filters', () => {
  it('accepts paymentMethodType=ach filter', () => {
    const result = searchTransactionsSchema.safeParse({
      paymentMethodType: 'ach',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.paymentMethodType).toBe('ach');
    }
  });

  it('accepts paymentMethodType=card filter', () => {
    const result = searchTransactionsSchema.safeParse({
      paymentMethodType: 'card',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid paymentMethodType', () => {
    const result = searchTransactionsSchema.safeParse({
      paymentMethodType: 'crypto',
    });
    expect(result.success).toBe(false);
  });

  it('accepts ACH-specific date range filters', () => {
    const result = searchTransactionsSchema.safeParse({
      paymentMethodType: 'ach',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    expect(result.success).toBe(true);
  });

  it('accepts customerId filter', () => {
    const result = searchTransactionsSchema.safeParse({
      customerId: 'cust_001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts locationId filter', () => {
    const result = searchTransactionsSchema.safeParse({
      locationId: 'loc_001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts orderId filter', () => {
    const result = searchTransactionsSchema.safeParse({
      orderId: 'ord_001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts amount range filters', () => {
    const result = searchTransactionsSchema.safeParse({
      amountMinCents: 100,
      amountMaxCents: 50000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts cursor for pagination', () => {
    const result = searchTransactionsSchema.safeParse({
      cursor: 'pi_01HXYZ',
    });
    expect(result.success).toBe(true);
  });

  it('defaults limit to 25', () => {
    const result = searchTransactionsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('accepts custom limit within bounds (1-100)', () => {
    const result = searchTransactionsSchema.safeParse({ limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit below 1', () => {
    const result = searchTransactionsSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 100', () => {
    const result = searchTransactionsSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('accepts combined ACH-specific and general filters', () => {
    const result = searchTransactionsSchema.safeParse({
      paymentMethodType: 'ach',
      status: 'ach_settled',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      customerId: 'cust_001',
      locationId: 'loc_001',
      limit: 10,
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. authorizePaymentSchema — ACH fields
// ═══════════════════════════════════════════════════════════════

describe('authorizePaymentSchema — ACH fields', () => {
  const baseInput = {
    clientRequestId: 'req-auth-001',
    amountCents: 5000,
    paymentMethodType: 'card' as const,
  };

  it('requires achSecCode when paymentMethodType is ach', () => {
    const result = authorizePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'ach',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const achSecIssue = result.error.issues.find((i) => i.path.includes('achSecCode'));
      expect(achSecIssue).toBeDefined();
    }
  });

  it('accepts ACH payment with required achSecCode', () => {
    const result = authorizePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'ach',
      achSecCode: 'WEB',
      achAccountType: 'ECHK',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid achSecCode values (CCD, PPD, TEL, WEB)', () => {
    for (const code of ['CCD', 'PPD', 'TEL', 'WEB'] as const) {
      const result = authorizePaymentSchema.safeParse({
        ...baseInput,
        paymentMethodType: 'ach',
        achSecCode: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts achAccountType ECHK and ESAV', () => {
    for (const type of ['ECHK', 'ESAV'] as const) {
      const result = authorizePaymentSchema.safeParse({
        ...baseInput,
        paymentMethodType: 'ach',
        achSecCode: 'WEB',
        achAccountType: type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts achDescription', () => {
    const result = authorizePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'ach',
      achSecCode: 'PPD',
      achDescription: 'Monthly membership dues',
    });
    expect(result.success).toBe(true);
  });

  it('does not require achSecCode for card payments', () => {
    const result = authorizePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'card',
    });
    expect(result.success).toBe(true);
  });

  it('does not require achSecCode for token payments', () => {
    const result = authorizePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'token',
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. salePaymentSchema — ACH fields
// ═══════════════════════════════════════════════════════════════

describe('salePaymentSchema — ACH fields', () => {
  const baseInput = {
    clientRequestId: 'req-sale-001',
    amountCents: 2500,
    paymentMethodType: 'card' as const,
  };

  it('requires achSecCode when paymentMethodType is ach', () => {
    const result = salePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'ach',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const achSecIssue = result.error.issues.find((i) => i.path.includes('achSecCode'));
      expect(achSecIssue).toBeDefined();
    }
  });

  it('accepts ACH sale with required fields', () => {
    const result = salePaymentSchema.safeParse({
      ...baseInput,
      paymentMethodType: 'ach',
      achSecCode: 'CCD',
      achAccountType: 'ECHK',
    });
    expect(result.success).toBe(true);
  });

  it('does not require achSecCode for card sale', () => {
    const result = salePaymentSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. refundPaymentSchema
// ═══════════════════════════════════════════════════════════════

describe('refundPaymentSchema', () => {
  it('accepts valid refund with all required fields', () => {
    const result = refundPaymentSchema.safeParse({
      clientRequestId: 'req-refund-001',
      paymentIntentId: 'pi_001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional amountCents for partial refund', () => {
    const result = refundPaymentSchema.safeParse({
      clientRequestId: 'req-refund-002',
      paymentIntentId: 'pi_001',
      amountCents: 1000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountCents).toBe(1000);
    }
  });

  it('requires clientRequestId', () => {
    const result = refundPaymentSchema.safeParse({
      paymentIntentId: 'pi_001',
    });
    expect(result.success).toBe(false);
  });

  it('requires paymentIntentId', () => {
    const result = refundPaymentSchema.safeParse({
      clientRequestId: 'req-refund-003',
    });
    expect(result.success).toBe(false);
  });

  it('rejects amountCents of 0', () => {
    const result = refundPaymentSchema.safeParse({
      clientRequestId: 'req-refund-004',
      paymentIntentId: 'pi_001',
      amountCents: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. TransactionListItem type shape — ACH fields
// ═══════════════════════════════════════════════════════════════

describe('TransactionListItem type shape', () => {
  it('includes ACH-specific fields in the interface', () => {
    // Type-level check: construct a valid TransactionListItem with ACH fields
    const item: TransactionListItem = {
      id: 'pi_001',
      status: 'ach_settled',
      amountCents: 5000,
      currency: 'USD',
      authorizedAmountCents: null,
      capturedAmountCents: null,
      refundedAmountCents: null,
      paymentMethodType: 'ach',
      cardLast4: null,
      cardBrand: null,
      customerId: 'cust_001',
      orderId: 'ord_001',
      locationId: 'loc_001',
      providerRef: 'CP12345',
      errorMessage: null,
      // ACH-specific
      achSettlementStatus: 'settled',
      achSecCode: 'WEB',
      achReturnCode: null,
      bankLast4: '6789',
      createdAt: '2026-02-20T12:00:00.000Z',
      updatedAt: '2026-02-20T12:00:00.000Z',
    };

    expect(item.achSettlementStatus).toBe('settled');
    expect(item.achSecCode).toBe('WEB');
    expect(item.achReturnCode).toBeNull();
    expect(item.bankLast4).toBe('6789');
    expect(item.paymentMethodType).toBe('ach');
  });

  it('allows null for ACH fields on card transactions', () => {
    const item: TransactionListItem = {
      id: 'pi_002',
      status: 'captured',
      amountCents: 3000,
      currency: 'USD',
      authorizedAmountCents: 3000,
      capturedAmountCents: 3000,
      refundedAmountCents: null,
      paymentMethodType: 'card',
      cardLast4: '4242',
      cardBrand: 'Visa',
      customerId: null,
      orderId: null,
      locationId: 'loc_001',
      providerRef: 'CP67890',
      errorMessage: null,
      achSettlementStatus: null,
      achSecCode: null,
      achReturnCode: null,
      bankLast4: null,
      createdAt: '2026-02-20T12:00:00.000Z',
      updatedAt: '2026-02-20T12:00:00.000Z',
    };

    expect(item.achSettlementStatus).toBeNull();
    expect(item.achSecCode).toBeNull();
    expect(item.bankLast4).toBeNull();
    expect(item.cardLast4).toBe('4242');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. TransactionDetail extends TransactionListItem
// ═══════════════════════════════════════════════════════════════

describe('TransactionDetail type shape', () => {
  it('includes provider info and transactions array', () => {
    const txnRecord: TransactionRecord = {
      id: 'txn_001',
      transactionType: 'sale',
      providerRef: 'CP12345',
      authCode: null,
      amountCents: 5000,
      responseStatus: 'A',
      responseCode: '000',
      responseText: 'Approved',
      avsResponse: null,
      cvvResponse: null,
      createdAt: '2026-02-20T12:00:00.000Z',
    };

    const detail: TransactionDetail = {
      id: 'pi_001',
      status: 'ach_originated',
      amountCents: 5000,
      currency: 'USD',
      authorizedAmountCents: null,
      capturedAmountCents: null,
      refundedAmountCents: null,
      paymentMethodType: 'ach',
      cardLast4: null,
      cardBrand: null,
      customerId: 'cust_001',
      orderId: 'ord_001',
      locationId: 'loc_001',
      providerRef: 'CP12345',
      errorMessage: null,
      achSettlementStatus: 'originated',
      achSecCode: 'PPD',
      achReturnCode: null,
      bankLast4: '6789',
      createdAt: '2026-02-20T12:00:00.000Z',
      updatedAt: '2026-02-20T12:00:00.000Z',
      // TransactionDetail-specific fields
      providerId: 'prov_001',
      merchantAccountId: 'ma_001',
      tenderId: null,
      token: 'tok_xxx',
      idempotencyKey: 'idem_001',
      metadata: null,
      createdBy: 'user_001',
      transactions: [txnRecord],
    };

    expect(detail.providerId).toBe('prov_001');
    expect(detail.merchantAccountId).toBe('ma_001');
    expect(detail.transactions).toHaveLength(1);
    expect(detail.transactions[0]!.transactionType).toBe('sale');
    expect(detail.achSettlementStatus).toBe('originated');
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. PollAchFundingInput / PollAchFundingResult type shapes
// ═══════════════════════════════════════════════════════════════

describe('PollAchFunding types', () => {
  it('PollAchFundingInput has correct shape with optional fields', () => {
    const minimalInput: PollAchFundingInput = {
      tenantId: 'tenant_001',
    };
    expect(minimalInput.tenantId).toBe('tenant_001');
    expect(minimalInput.date).toBeUndefined();
    expect(minimalInput.lookbackDays).toBeUndefined();

    const fullInput: PollAchFundingInput = {
      tenantId: 'tenant_001',
      date: '2026-02-20',
      lookbackDays: 3,
    };
    expect(fullInput.date).toBe('2026-02-20');
    expect(fullInput.lookbackDays).toBe(3);
  });

  it('PollAchFundingResult has correct shape', () => {
    const result: PollAchFundingResult = {
      merchantId: 'MID123456',
      date: '2026-02-20',
      totalTransactions: 15,
      settledCount: 10,
      originatedCount: 3,
      returnedCount: 1,
      skippedCount: 1,
    };

    expect(result.merchantId).toBe('MID123456');
    expect(result.totalTransactions).toBe(15);
    expect(result.settledCount + result.originatedCount + result.returnedCount + result.skippedCount)
      .toBe(result.totalTransactions);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. ProcessAchReturn types
// ═══════════════════════════════════════════════════════════════

describe('ProcessAchReturn types', () => {
  it('ProcessAchReturnInput requires paymentIntentId and returnCode', () => {
    const input: ProcessAchReturnInput = {
      paymentIntentId: 'pi_001',
      returnCode: 'R01',
      returnDate: '2026-02-20',
    };
    expect(input.paymentIntentId).toBe('pi_001');
    expect(input.returnCode).toBe('R01');
    expect(input.returnDate).toBe('2026-02-20');
  });

  it('ProcessAchReturnInput accepts optional fields', () => {
    const input: ProcessAchReturnInput = {
      paymentIntentId: 'pi_001',
      returnCode: 'R01',
      returnDate: '2026-02-20',
      returnReason: 'Insufficient Funds',
      providerRef: 'CP_RET_001',
      fundingBatchId: 'BATCH_001',
    };
    expect(input.returnReason).toBe('Insufficient Funds');
    expect(input.providerRef).toBe('CP_RET_001');
    expect(input.fundingBatchId).toBe('BATCH_001');
  });

  it('ProcessAchReturnResult has correct shape', () => {
    const result: ProcessAchReturnResult = {
      achReturnId: 'aret_001',
      paymentIntentId: 'pi_001',
      returnCode: 'R01',
      returnReason: 'Insufficient Funds',
      isRetryable: true,
    };
    expect(result.achReturnId).toBeTruthy();
    expect(result.isRetryable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. ACH Event Payloads
// ═══════════════════════════════════════════════════════════════

describe('ACH event constants and payloads', () => {
  it('PAYMENT_GATEWAY_EVENTS includes ACH events', () => {
    expect(PAYMENT_GATEWAY_EVENTS.ACH_ORIGINATED).toBe('payment.gateway.ach_originated.v1');
    expect(PAYMENT_GATEWAY_EVENTS.ACH_SETTLED).toBe('payment.gateway.ach_settled.v1');
    expect(PAYMENT_GATEWAY_EVENTS.ACH_RETURNED).toBe('payment.gateway.ach_returned.v1');
  });

  it('AchOriginatedPayload has correct shape', () => {
    const payload: AchOriginatedPayload = {
      paymentIntentId: 'pi_001',
      tenantId: 'tenant_001',
      locationId: 'loc_001',
      merchantAccountId: 'ma_001',
      amountCents: 5000,
      currency: 'USD',
      orderId: 'ord_001',
      customerId: 'cust_001',
      providerRef: 'CP12345',
      achSecCode: 'WEB',
      achAccountType: 'ECHK',
      bankLast4: '6789',
    };
    expect(payload.achSecCode).toBe('WEB');
    expect(payload.achAccountType).toBe('ECHK');
    expect(payload.bankLast4).toBe('6789');
  });

  it('AchSettledPayload has correct shape with funding date', () => {
    const payload: AchSettledPayload = {
      paymentIntentId: 'pi_001',
      tenantId: 'tenant_001',
      locationId: 'loc_001',
      merchantAccountId: 'ma_001',
      amountCents: 5000,
      settledAt: '2026-02-20T15:00:00.000Z',
      fundingDate: '2026-02-20',
      providerRef: 'CP12345',
    };
    expect(payload.fundingDate).toBe('2026-02-20');
    expect(payload.settledAt).toBeTruthy();
  });

  it('AchReturnedPayload has correct shape with return info', () => {
    const payload: AchReturnedPayload = {
      paymentIntentId: 'pi_001',
      tenantId: 'tenant_001',
      locationId: 'loc_001',
      merchantAccountId: 'ma_001',
      amountCents: 5000,
      returnCode: 'R01',
      returnReason: 'Insufficient Funds',
      returnDate: '2026-02-22',
      providerRef: 'CP12345',
      orderId: 'ord_001',
      customerId: 'cust_001',
      achReturnId: 'aret_001',
      isRetryable: true,
    };
    expect(payload.returnCode).toBe('R01');
    expect(payload.isRetryable).toBe(true);
    expect(payload.achReturnId).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. ACH Status Transitions
// ═══════════════════════════════════════════════════════════════

describe('ACH status transitions', () => {
  it('VALID_INTENT_STATUSES includes all ACH statuses', () => {
    expect(VALID_INTENT_STATUSES).toContain('ach_pending');
    expect(VALID_INTENT_STATUSES).toContain('ach_originated');
    expect(VALID_INTENT_STATUSES).toContain('ach_settled');
    expect(VALID_INTENT_STATUSES).toContain('ach_returned');
  });

  it('ach_pending can transition to ach_originated', () => {
    expect(() => assertIntentTransition('ach_pending', 'ach_originated')).not.toThrow();
  });

  it('ach_pending can transition to ach_returned', () => {
    expect(() => assertIntentTransition('ach_pending', 'ach_returned')).not.toThrow();
  });

  it('ach_pending can transition to voided', () => {
    expect(() => assertIntentTransition('ach_pending', 'voided')).not.toThrow();
  });

  it('ach_pending can transition to error', () => {
    expect(() => assertIntentTransition('ach_pending', 'error')).not.toThrow();
  });

  it('ach_originated can transition to ach_settled', () => {
    expect(() => assertIntentTransition('ach_originated', 'ach_settled')).not.toThrow();
  });

  it('ach_originated can transition to ach_returned', () => {
    expect(() => assertIntentTransition('ach_originated', 'ach_returned')).not.toThrow();
  });

  it('ach_settled can transition to ach_returned (late returns)', () => {
    expect(() => assertIntentTransition('ach_settled', 'ach_returned')).not.toThrow();
  });

  it('ach_returned can transition to resolved', () => {
    expect(() => assertIntentTransition('ach_returned', 'resolved')).not.toThrow();
  });

  it('ach_returned cannot transition to ach_settled', () => {
    expect(() => assertIntentTransition('ach_returned', 'ach_settled')).toThrow();
  });

  it('ach_settled cannot transition to ach_originated', () => {
    expect(() => assertIntentTransition('ach_settled', 'ach_originated')).toThrow();
  });

  it('created can transition to ach_pending', () => {
    expect(() => assertIntentTransition('created', 'ach_pending')).not.toThrow();
  });

  it('INTENT_STATUS_TRANSITIONS documents ACH flows', () => {
    expect(INTENT_STATUS_TRANSITIONS['ach_pending']).toEqual(
      expect.arrayContaining(['ach_originated', 'ach_returned', 'voided', 'error']),
    );
    expect(INTENT_STATUS_TRANSITIONS['ach_originated']).toEqual(
      expect.arrayContaining(['ach_settled', 'ach_returned', 'error']),
    );
    expect(INTENT_STATUS_TRANSITIONS['ach_settled']).toEqual(['ach_returned']);
    expect(INTENT_STATUS_TRANSITIONS['ach_returned']).toEqual(['resolved']);
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. AchSettlementStatus type
// ═══════════════════════════════════════════════════════════════

describe('AchSettlementStatus type', () => {
  it('covers all four settlement statuses', () => {
    const statuses: AchSettlementStatus[] = ['pending', 'originated', 'settled', 'returned'];
    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('pending');
    expect(statuses).toContain('originated');
    expect(statuses).toContain('settled');
    expect(statuses).toContain('returned');
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. ACH Return Code Helpers
// ═══════════════════════════════════════════════════════════════

describe('ACH return code helpers', () => {
  it('getReturnCode returns known codes', () => {
    const r01 = getReturnCode('R01');
    expect(r01).toBeDefined();
    expect(r01!.description).toBe('Insufficient Funds');
    expect(r01!.category).toBe('nsf');
    expect(r01!.retryable).toBe(true);
  });

  it('getReturnCode returns undefined for unknown codes', () => {
    const unknown = getReturnCode('R99');
    expect(unknown).toBeUndefined();
  });

  it('getReturnCode is case-insensitive', () => {
    const r01Lower = getReturnCode('r01');
    expect(r01Lower).toBeDefined();
    expect(r01Lower!.code).toBe('R01');
  });

  it('isRetryableReturn returns true for R01 (NSF)', () => {
    expect(isRetryableReturn('R01')).toBe(true);
  });

  it('isRetryableReturn returns true for R09 (Uncollected Funds)', () => {
    expect(isRetryableReturn('R09')).toBe(true);
  });

  it('isRetryableReturn returns false for R02 (Account Closed)', () => {
    expect(isRetryableReturn('R02')).toBe(false);
  });

  it('isRetryableReturn returns false for unknown codes', () => {
    expect(isRetryableReturn('R99')).toBe(false);
  });

  it('getRetryDelayDays returns 2 for R01', () => {
    expect(getRetryDelayDays('R01')).toBe(2);
  });

  it('getRetryDelayDays returns 0 for non-retryable codes', () => {
    expect(getRetryDelayDays('R02')).toBe(0);
    expect(getRetryDelayDays('R03')).toBe(0);
  });

  it('classifyReturn categorizes correctly', () => {
    expect(classifyReturn('R01')).toBe('nsf');
    expect(classifyReturn('R02')).toBe('closed');
    expect(classifyReturn('R03')).toBe('invalid');
    expect(classifyReturn('R05')).toBe('unauthorized');
    expect(classifyReturn('R06')).toBe('admin');
    expect(classifyReturn('R16')).toBe('regulatory');
    expect(classifyReturn('R11')).toBe('other');
  });

  it('classifyReturn returns other for unknown codes', () => {
    expect(classifyReturn('R99')).toBe('other');
  });

  it('getReturnDescription returns description for known codes', () => {
    expect(getReturnDescription('R01')).toBe('Insufficient Funds');
    expect(getReturnDescription('R02')).toBe('Account Closed');
    expect(getReturnDescription('R07')).toBe('Authorization Revoked by Customer');
  });

  it('getReturnDescription returns fallback for unknown codes', () => {
    expect(getReturnDescription('R99')).toBe('Unknown return code: R99');
  });

  it('isAdministrativeReturn identifies admin returns', () => {
    expect(isAdministrativeReturn('R06')).toBe(true);
    expect(isAdministrativeReturn('R12')).toBe(true);
    expect(isAdministrativeReturn('R13')).toBe(true);
    expect(isAdministrativeReturn('R24')).toBe(true);
    expect(isAdministrativeReturn('R61')).toBe(true);
    expect(isAdministrativeReturn('R67')).toBe(true);
    expect(isAdministrativeReturn('R68')).toBe(true);
    expect(isAdministrativeReturn('R69')).toBe(true);
    expect(isAdministrativeReturn('R70')).toBe(true);
    expect(isAdministrativeReturn('R83')).toBe(true);
  });

  it('isAdministrativeReturn returns false for non-admin returns', () => {
    expect(isAdministrativeReturn('R01')).toBe(false);
    expect(isAdministrativeReturn('R02')).toBe(false);
    expect(isAdministrativeReturn('R05')).toBe(false);
  });

  it('ALL_RETURN_CODES is a non-empty array', () => {
    expect(ALL_RETURN_CODES.length).toBeGreaterThan(0);
    expect(ALL_RETURN_CODES[0]).toHaveProperty('code');
    expect(ALL_RETURN_CODES[0]).toHaveProperty('description');
    expect(ALL_RETURN_CODES[0]).toHaveProperty('category');
    expect(ALL_RETURN_CODES[0]).toHaveProperty('retryable');
    expect(ALL_RETURN_CODES[0]).toHaveProperty('retryDelayDays');
    expect(ALL_RETURN_CODES[0]).toHaveProperty('isAdministrative');
  });

  it('ALL_RETURN_CODES includes all expected common codes', () => {
    const codes = ALL_RETURN_CODES.map((r) => r.code);
    expect(codes).toContain('R01');
    expect(codes).toContain('R02');
    expect(codes).toContain('R03');
    expect(codes).toContain('R05');
    expect(codes).toContain('R07');
    expect(codes).toContain('R09');
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. ACH Status Query Types
// ═══════════════════════════════════════════════════════════════

describe('ACH status query types', () => {
  it('AchStatusSummary has correct shape', () => {
    const summary: AchStatusSummary = {
      pendingCount: 5,
      pendingAmountCents: 25000,
      originatedCount: 10,
      originatedAmountCents: 50000,
      settledCount: 100,
      settledAmountCents: 500000,
      returnedCount: 2,
      returnedAmountCents: 10000,
    };
    expect(summary.pendingCount + summary.originatedCount + summary.settledCount + summary.returnedCount).toBe(117);
  });

  it('AchPendingItem has correct shape', () => {
    const item: AchPendingItem = {
      id: 'pi_001',
      amountCents: 5000,
      customerId: 'cust_001',
      orderId: 'ord_001',
      achSecCode: 'WEB',
      bankLast4: '6789',
      achSettlementStatus: 'pending',
      createdAt: '2026-02-20T12:00:00.000Z',
    };
    expect(item.achSettlementStatus).toBe('pending');
    expect(item.achSecCode).toBe('WEB');
  });

  it('AchPendingItem allows null optional fields', () => {
    const item: AchPendingItem = {
      id: 'pi_002',
      amountCents: 3000,
      customerId: null,
      orderId: null,
      achSecCode: null,
      bankLast4: null,
      achSettlementStatus: 'originated',
      createdAt: '2026-02-20T12:00:00.000Z',
    };
    expect(item.customerId).toBeNull();
    expect(item.bankLast4).toBeNull();
  });

  it('AchReturnItem has correct shape', () => {
    const item: AchReturnItem = {
      id: 'aret_001',
      paymentIntentId: 'pi_001',
      returnCode: 'R01',
      returnReason: 'Insufficient Funds',
      returnDate: '2026-02-22',
      originalAmountCents: 5000,
      isAdministrative: false,
      resolvedAt: null,
      createdAt: '2026-02-22T08:00:00.000Z',
    };
    expect(item.returnCode).toBe('R01');
    expect(item.isAdministrative).toBe(false);
    expect(item.resolvedAt).toBeNull();
  });

  it('AchReturnCodeDistribution has correct shape', () => {
    const dist: AchReturnCodeDistribution = {
      returnCode: 'R01',
      returnReason: 'Insufficient Funds',
      count: 42,
    };
    expect(dist.count).toBe(42);
  });

  it('AchSettlementByDate has correct shape', () => {
    const row: AchSettlementByDate = {
      date: '2026-02-20',
      settledCount: 10,
      settledAmountCents: 50000,
      returnedCount: 1,
      returnedAmountCents: 5000,
    };
    expect(row.settledAmountCents).toBe(50000);
    expect(row.returnedAmountCents).toBe(5000);
  });

  it('GetAchStatusInput has correct shape with optional fields', () => {
    const minimal: GetAchStatusInput = {
      tenantId: 'tenant_001',
    };
    expect(minimal.dateFrom).toBeUndefined();

    const full: GetAchStatusInput = {
      tenantId: 'tenant_001',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      locationId: 'loc_001',
    };
    expect(full.dateFrom).toBe('2026-01-01');
    expect(full.locationId).toBe('loc_001');
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. ACH Happy Path — Full Schema Flow
// ═══════════════════════════════════════════════════════════════

describe('ACH happy path schema flow', () => {
  it('tokenize -> add -> verify -> sale flows through cleanly', () => {
    // Step 1: Tokenize
    const tokenizeResult = tokenizeBankAccountSchema.safeParse({
      routingNumber: '021000021',
      accountNumber: '123456789',
      accountType: 'checking',
    });
    expect(tokenizeResult.success).toBe(true);

    // Step 2: Add bank account with the token
    const addResult = addBankAccountSchema.safeParse({
      clientRequestId: 'req-flow-001',
      customerId: 'cust_001',
      token: '9401234567890123',
      routingLast4: '0021',
      accountLast4: '6789',
      accountType: 'checking',
      bankName: 'Chase',
      nickname: 'Business Account',
    });
    expect(addResult.success).toBe(true);

    // Step 3: Verify micro-deposits
    const verifyResult = verifyMicroDepositsSchema.safeParse({
      paymentMethodId: 'pm_001',
      amount1Cents: 12,
      amount2Cents: 34,
    });
    expect(verifyResult.success).toBe(true);

    // Step 4: ACH sale
    const saleResult = salePaymentSchema.safeParse({
      clientRequestId: 'req-flow-002',
      amountCents: 10000,
      paymentMethodType: 'ach',
      achSecCode: 'WEB',
      achAccountType: 'ECHK',
      customerId: 'cust_001',
      orderId: 'ord_001',
    });
    expect(saleResult.success).toBe(true);
  });

  it('status lifecycle progresses correctly: created -> ach_pending -> ach_originated -> ach_settled', () => {
    expect(() => assertIntentTransition('created', 'ach_pending')).not.toThrow();
    expect(() => assertIntentTransition('ach_pending', 'ach_originated')).not.toThrow();
    expect(() => assertIntentTransition('ach_originated', 'ach_settled')).not.toThrow();
  });

  it('return lifecycle: originated -> ach_returned -> resolved', () => {
    expect(() => assertIntentTransition('ach_originated', 'ach_returned')).not.toThrow();
    expect(() => assertIntentTransition('ach_returned', 'resolved')).not.toThrow();
  });

  it('late return lifecycle: settled -> ach_returned -> resolved', () => {
    expect(() => assertIntentTransition('ach_settled', 'ach_returned')).not.toThrow();
    expect(() => assertIntentTransition('ach_returned', 'resolved')).not.toThrow();
  });
});
