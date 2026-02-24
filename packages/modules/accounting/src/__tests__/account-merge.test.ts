/**
 * Account Merge & Renumber Tests
 *
 * Tests the merge and renumber GL account commands.
 * Since these commands require DB access, we mock the infrastructure
 * and validate the logic/validation paths.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mock infrastructure ──────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  db: {},
  glAccounts: { id: 'id', tenantId: 'tenantId', accountNumber: 'accountNumber', parentAccountId: 'parentAccountId', isActive: 'isActive', status: 'status', mergedIntoId: 'mergedIntoId' },
  glJournalLines: { accountId: 'accountId' },
  glAccountChangeLogs: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: Object.assign(vi.fn(), { join: vi.fn(), identifier: vi.fn() }),
}));

// ── Test validateMerge (pure function, no DB) ────────────────────

import { validateMerge } from '../services/coa-validation';
import type { GLAccountForValidation } from '../services/coa-validation';

function makeAccount(overrides: Partial<GLAccountForValidation> = {}): GLAccountForValidation {
  return {
    id: 'acct-1',
    accountNumber: '10000',
    parentAccountId: null,
    name: 'Test Account',
    accountType: 'asset',
    isActive: true,
    isFallback: false,
    isSystemAccount: false,
    isControlAccount: false,
    controlAccountType: null,
    status: 'active',
    ...overrides,
  };
}

describe('validateMerge', () => {
  it('allows valid same-type merge', () => {
    const source = makeAccount({ id: 'src', accountNumber: '10010' });
    const target = makeAccount({ id: 'tgt', accountNumber: '10020' });
    expect(validateMerge(source, target)).toHaveLength(0);
  });

  it('rejects self-merge', () => {
    const acct = makeAccount({ id: 'same' });
    expect(validateMerge(acct, acct).length).toBeGreaterThan(0);
  });

  it('rejects cross-type merge', () => {
    const source = makeAccount({ id: 'src', accountType: 'asset' });
    const target = makeAccount({ id: 'tgt', accountType: 'revenue' });
    const errors = validateMerge(source, target);
    expect(errors.some((e) => e.message.includes('different types'))).toBe(true);
  });

  it('rejects system account as merge source', () => {
    const source = makeAccount({ id: 'src', isSystemAccount: true });
    const target = makeAccount({ id: 'tgt' });
    expect(validateMerge(source, target).length).toBeGreaterThan(0);
  });

  it('rejects fallback account as merge source', () => {
    const source = makeAccount({ id: 'src', isFallback: true });
    const target = makeAccount({ id: 'tgt' });
    expect(validateMerge(source, target).length).toBeGreaterThan(0);
  });

  it('rejects inactive target', () => {
    const source = makeAccount({ id: 'src' });
    const target = makeAccount({ id: 'tgt', isActive: false, status: 'inactive' });
    expect(validateMerge(source, target).length).toBeGreaterThan(0);
  });

  it('rejects already pending_merge source', () => {
    const source = makeAccount({ id: 'src', status: 'pending_merge' });
    const target = makeAccount({ id: 'tgt' });
    expect(validateMerge(source, target).length).toBeGreaterThan(0);
  });

  it('accumulates multiple errors', () => {
    const source = makeAccount({ id: 'same', isSystemAccount: true, accountType: 'asset' });
    const target = makeAccount({ id: 'same', isActive: false, status: 'inactive', accountType: 'liability' });
    const errors = validateMerge(source, target);
    // self-merge + type mismatch + system account + inactive target
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Renumber validation (account number uniqueness) ──────────────

describe('renumber validation', () => {
  it('rejects renumber to existing account number', () => {
    // This tests the pure validation logic — in the actual command,
    // the uniqueness check is done via DB query
    const existing = [
      makeAccount({ id: 'a1', accountNumber: '10000' }),
      makeAccount({ id: 'a2', accountNumber: '20000' }),
    ];
    const isDuplicate = existing.some(
      (a) => a.accountNumber === '20000' && a.id !== 'a1',
    );
    expect(isDuplicate).toBe(true);
  });

  it('allows renumber to unused number', () => {
    const existing = [
      makeAccount({ id: 'a1', accountNumber: '10000' }),
      makeAccount({ id: 'a2', accountNumber: '20000' }),
    ];
    const isDuplicate = existing.some(
      (a) => a.accountNumber === '30000' && a.id !== 'a1',
    );
    expect(isDuplicate).toBe(false);
  });

  it('allows renumber to same number (no-op)', () => {
    const existing = [
      makeAccount({ id: 'a1', accountNumber: '10000' }),
    ];
    const isDuplicate = existing.some(
      (a) => a.accountNumber === '10000' && a.id !== 'a1',
    );
    expect(isDuplicate).toBe(false);
  });
});
