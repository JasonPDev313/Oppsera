import { describe, it, expect } from 'vitest';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';
import { UnbalancedJournalError, PeriodLockedError, CurrencyMismatchError, ControlAccountError } from '../errors';
import { postJournalEntrySchema, updateAccountingSettingsSchema, lockAccountingPeriodSchema } from '../validation';

describe('resolveNormalBalance', () => {
  it('should return debit for asset accounts', () => {
    expect(resolveNormalBalance('asset')).toBe('debit');
  });

  it('should return debit for expense accounts', () => {
    expect(resolveNormalBalance('expense')).toBe('debit');
  });

  it('should return credit for liability accounts', () => {
    expect(resolveNormalBalance('liability')).toBe('credit');
  });

  it('should return credit for equity accounts', () => {
    expect(resolveNormalBalance('equity')).toBe('credit');
  });

  it('should return credit for revenue accounts', () => {
    expect(resolveNormalBalance('revenue')).toBe('credit');
  });

  it('should throw for unknown account type', () => {
    expect(() => resolveNormalBalance('unknown')).toThrow('Unknown account type');
  });
});

describe('Error Classes', () => {
  it('UnbalancedJournalError has correct code and status', () => {
    const err = new UnbalancedJournalError(100, 99);
    expect(err.code).toBe('UNBALANCED_JOURNAL');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('100');
    expect(err.message).toContain('99');
  });

  it('PeriodLockedError has correct code and status', () => {
    const err = new PeriodLockedError('2026-01');
    expect(err.code).toBe('PERIOD_LOCKED');
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('2026-01');
  });

  it('CurrencyMismatchError has correct message', () => {
    const err = new CurrencyMismatchError('EUR', 'USD');
    expect(err.code).toBe('CURRENCY_MISMATCH');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('EUR');
    expect(err.message).toContain('USD');
    expect(err.message).toContain('Multi-currency is not yet supported');
  });

  it('ControlAccountError has correct code and status', () => {
    const err = new ControlAccountError('acct-1', 'test reason');
    expect(err.code).toBe('CONTROL_ACCOUNT_RESTRICTED');
    expect(err.statusCode).toBe(403);
  });
});

describe('Zod Schemas', () => {
  describe('postJournalEntrySchema', () => {
    it('should accept valid input', () => {
      const input = {
        businessDate: '2026-01-15',
        sourceModule: 'manual',
        lines: [
          { accountId: 'acct-1', debitAmount: '100.00' },
          { accountId: 'acct-2', creditAmount: '100.00' },
        ],
      };
      const result = postJournalEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty lines', () => {
      const input = {
        businessDate: '2026-01-15',
        sourceModule: 'manual',
        lines: [],
      };
      const result = postJournalEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const input = {
        businessDate: '2026/01/15',
        sourceModule: 'manual',
        lines: [{ accountId: 'acct-1', debitAmount: '100.00' }],
      };
      const result = postJournalEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should default forcePost to false', () => {
      const input = {
        businessDate: '2026-01-15',
        sourceModule: 'manual',
        lines: [{ accountId: 'acct-1', debitAmount: '100.00' }],
      };
      const result = postJournalEntrySchema.parse(input);
      expect(result.forcePost).toBe(false);
    });

    it('should accept optional fields', () => {
      const input = {
        businessDate: '2026-01-15',
        sourceModule: 'ap',
        sourceReferenceId: 'bill-123',
        memo: 'AP posting',
        currency: 'USD',
        forcePost: true,
        lines: [
          { accountId: 'acct-1', debitAmount: '50.00', locationId: 'loc-1', vendorId: 'v-1', memo: 'Line memo' },
          { accountId: 'acct-2', creditAmount: '50.00' },
        ],
      };
      const result = postJournalEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('updateAccountingSettingsSchema', () => {
    it('should accept partial updates', () => {
      const result = updateAccountingSettingsSchema.safeParse({ enableCogsPosting: true });
      expect(result.success).toBe(true);
    });

    it('should accept nullable account IDs', () => {
      const result = updateAccountingSettingsSchema.safeParse({
        defaultAPControlAccountId: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid fiscal month', () => {
      const result = updateAccountingSettingsSchema.safeParse({
        fiscalYearStartMonth: 13,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid autoPostMode', () => {
      const result = updateAccountingSettingsSchema.safeParse({
        autoPostMode: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('lockAccountingPeriodSchema', () => {
    it('should accept YYYY-MM format', () => {
      const result = lockAccountingPeriodSchema.safeParse({ period: '2026-01' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', () => {
      const result = lockAccountingPeriodSchema.safeParse({ period: '2026-1' });
      expect(result.success).toBe(false);
    });

    it('should reject full date', () => {
      const result = lockAccountingPeriodSchema.safeParse({ period: '2026-01-15' });
      expect(result.success).toBe(false);
    });
  });
});
