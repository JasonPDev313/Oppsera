import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAccountingBootstrapped } from '../helpers/get-accounting-settings';

vi.mock('@oppsera/db', () => ({
  accountingSettings: { tenantId: 'tenantId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  sql: Object.assign(
    function sql(strings: TemplateStringsArray, ...values: unknown[]) {
      return { strings, values, __isSql: true };
    },
    {
      raw: (s: string) => s,
      join: (parts: unknown[], separator?: unknown) => ({ __isSqlJoin: true, parts, separator }),
    },
  ),
}));

describe('isAccountingBootstrapped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockTx(response: unknown) {
    return {
      execute: vi.fn().mockResolvedValue(response),
    } as any;
  }

  it('returns bootstrapped=true when settings and accounts exist', async () => {
    const tx = createMockTx([{ settings_count: 1, account_count: 42 }]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: true, accountCount: 42 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('returns bootstrapped=false when settings exist but no accounts', async () => {
    const tx = createMockTx([{ settings_count: 1, account_count: 0 }]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: false, accountCount: 0 });
  });

  it('returns bootstrapped=false when accounts exist but no settings', async () => {
    const tx = createMockTx([{ settings_count: 0, account_count: 30 }]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: false, accountCount: 30 });
  });

  it('returns bootstrapped=false when neither exists', async () => {
    const tx = createMockTx([{ settings_count: 0, account_count: 0 }]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: false, accountCount: 0 });
  });

  it('handles empty result set gracefully', async () => {
    const tx = createMockTx([]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: false, accountCount: 0 });
  });

  it('coerces string counts from postgres.js (numeric → Number)', async () => {
    // postgres.js may return numeric types as strings
    const tx = createMockTx([{ settings_count: '1', account_count: '55' }]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: true, accountCount: 55 });
  });

  it('catches "relation does not exist" and returns not-bootstrapped', async () => {
    const tx = {
      execute: vi.fn().mockRejectedValue(
        new Error('relation "accounting_settings" does not exist'),
      ),
    } as any;

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    expect(result).toEqual({ bootstrapped: false, accountCount: 0 });
  });

  it('re-throws non-table errors (e.g. connection failures)', async () => {
    const tx = {
      execute: vi.fn().mockRejectedValue(
        new Error('connection refused'),
      ),
    } as any;

    await expect(isAccountingBootstrapped(tx, 'tenant-1'))
      .rejects.toThrow('connection refused');
  });

  it('handles null row values gracefully', async () => {
    const tx = createMockTx([{ settings_count: null, account_count: null }]);

    const result = await isAccountingBootstrapped(tx, 'tenant-1');

    // Number(null) = 0
    expect(result).toEqual({ bootstrapped: false, accountCount: 0 });
  });
});
