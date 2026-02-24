/**
 * COA Validation Engine Tests
 *
 * Tests for validateFullCoa, validateSingleAccount, validateMerge,
 * and validateDeactivation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateFullCoa,
  validateSingleAccount,
  validateMerge,
  validateDeactivation,
} from '../services/coa-validation';
import type { GLAccountForValidation } from '../services/coa-validation';

// ── Helpers ──────────────────────────────────────────────────────

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

function makeMinimalCoa(): GLAccountForValidation[] {
  return [
    makeAccount({ id: 'a1', accountNumber: '10000', name: 'Cash', accountType: 'asset' }),
    makeAccount({ id: 'a2', accountNumber: '20000', name: 'AP', accountType: 'liability' }),
    makeAccount({ id: 'a3', accountNumber: '30000', name: 'Equity', accountType: 'equity' }),
    makeAccount({ id: 'a4', accountNumber: '40000', name: 'Revenue', accountType: 'revenue' }),
    makeAccount({ id: 'a5', accountNumber: '50000', name: 'Expenses', accountType: 'expense' }),
  ];
}

// ── validateFullCoa ──────────────────────────────────────────────

describe('validateFullCoa', () => {
  it('passes for a complete COA', () => {
    const { errors, warnings } = validateFullCoa(makeMinimalCoa());
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('warns when a major type is missing', () => {
    const accounts = makeMinimalCoa().filter((a) => a.accountType !== 'equity');
    const { warnings } = validateFullCoa(accounts);
    expect(warnings.some((w) => w.message.includes('equity'))).toBe(true);
  });

  it('errors on orphan parent reference', () => {
    const accounts = [
      ...makeMinimalCoa(),
      makeAccount({
        id: 'orphan',
        accountNumber: '99999',
        name: 'Orphan',
        parentAccountId: 'nonexistent-parent',
      }),
    ];
    const { errors } = validateFullCoa(accounts);
    expect(errors.some((e) => e.message.includes('non-existent parent'))).toBe(true);
  });

  it('errors on circular hierarchy', () => {
    const accounts = [
      makeAccount({ id: 'c1', accountNumber: '10001', name: 'C1', parentAccountId: 'c2' }),
      makeAccount({ id: 'c2', accountNumber: '10002', name: 'C2', parentAccountId: 'c1' }),
    ];
    const { errors } = validateFullCoa(accounts);
    expect(errors.some((e) => e.message.includes('Circular hierarchy'))).toBe(true);
  });

  it('errors when system account is inactive', () => {
    const accounts = makeMinimalCoa();
    accounts.push(
      makeAccount({
        id: 'sys',
        accountNumber: '99990',
        name: 'System Account',
        isSystemAccount: true,
        isActive: false,
        status: 'inactive',
      }),
    );
    const { errors } = validateFullCoa(accounts);
    expect(errors.some((e) => e.message.includes('System/fallback account'))).toBe(true);
  });

  it('errors when fallback account is inactive', () => {
    const accounts = makeMinimalCoa();
    accounts.push(
      makeAccount({
        id: 'fb',
        accountNumber: '99991',
        name: 'Fallback',
        isFallback: true,
        isActive: false,
        status: 'inactive',
      }),
    );
    const { errors } = validateFullCoa(accounts);
    expect(errors.some((e) => e.message.includes('System/fallback account'))).toBe(true);
  });

  it('warns on duplicate names under same parent', () => {
    const accounts = makeMinimalCoa();
    accounts.push(
      makeAccount({ id: 'dup1', accountNumber: '10001', name: 'Cash', accountType: 'asset' }),
    );
    const { warnings } = validateFullCoa(accounts);
    expect(warnings.some((w) => w.message.includes('Duplicate account name'))).toBe(true);
  });
});

// ── validateSingleAccount ────────────────────────────────────────

describe('validateSingleAccount', () => {
  const existing = makeMinimalCoa();

  it('passes for a valid account', () => {
    const errors = validateSingleAccount(
      { accountNumber: '11000', name: 'New Account', accountType: 'asset' },
      existing,
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects empty account number', () => {
    const errors = validateSingleAccount(
      { accountNumber: '', name: 'Test', accountType: 'asset' },
      existing,
    );
    expect(errors.some((e) => e.field === 'accountNumber')).toBe(true);
  });

  it('rejects account number > 20 chars', () => {
    const errors = validateSingleAccount(
      { accountNumber: '123456789012345678901', name: 'Test', accountType: 'asset' },
      existing,
    );
    expect(errors.some((e) => e.field === 'accountNumber')).toBe(true);
  });

  it('rejects empty name', () => {
    const errors = validateSingleAccount(
      { accountNumber: '11000', name: '', accountType: 'asset' },
      existing,
    );
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects name > 200 chars', () => {
    const errors = validateSingleAccount(
      { accountNumber: '11000', name: 'A'.repeat(201), accountType: 'asset' },
      existing,
    );
    expect(errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects duplicate account number', () => {
    const errors = validateSingleAccount(
      { accountNumber: '10000', name: 'Duplicate', accountType: 'asset' },
      existing,
    );
    expect(errors.some((e) => e.message.includes('already exists'))).toBe(true);
  });

  it('allows same number when excludeId matches', () => {
    const errors = validateSingleAccount(
      { accountNumber: '10000', name: 'Cash Updated', accountType: 'asset' },
      existing,
      'a1',
    );
    expect(errors.filter((e) => e.message.includes('already exists'))).toHaveLength(0);
  });

  it('rejects nonexistent parent', () => {
    const errors = validateSingleAccount(
      { accountNumber: '11000', name: 'Test', accountType: 'asset', parentAccountId: 'fake' },
      existing,
    );
    expect(errors.some((e) => e.message.includes('does not exist'))).toBe(true);
  });

  it('rejects inactive parent', () => {
    const withInactive = [
      ...existing,
      makeAccount({
        id: 'inactive-parent',
        accountNumber: '19000',
        name: 'Inactive',
        isActive: false,
        status: 'inactive',
      }),
    ];
    const errors = validateSingleAccount(
      { accountNumber: '19001', name: 'Child', accountType: 'asset', parentAccountId: 'inactive-parent' },
      withInactive,
    );
    expect(errors.some((e) => e.message.includes('inactive'))).toBe(true);
  });

  it('rejects different type parent', () => {
    const errors = validateSingleAccount(
      { accountNumber: '11000', name: 'Asset Child', accountType: 'asset', parentAccountId: 'a2' },
      existing,
    );
    expect(errors.some((e) => e.message.includes('type'))).toBe(true);
  });

  it('detects circular reference on update', () => {
    // a1 (10000) has no parent. child with parent a1.
    const withChild = [
      ...existing,
      makeAccount({
        id: 'child-of-a1',
        accountNumber: '10001',
        name: 'Child',
        parentAccountId: 'a1',
      }),
    ];
    // Try to set a1's parent to child-of-a1 (creates cycle)
    const errors = validateSingleAccount(
      { accountNumber: '10000', name: 'Cash', accountType: 'asset', parentAccountId: 'child-of-a1' },
      withChild,
      'a1',
    );
    expect(errors.some((e) => e.message.includes('circular'))).toBe(true);
  });
});

// ── validateMerge ────────────────────────────────────────────────

describe('validateMerge', () => {
  it('passes for valid same-type merge', () => {
    const source = makeAccount({ id: 's1', accountNumber: '10010', accountType: 'asset' });
    const target = makeAccount({ id: 't1', accountNumber: '10020', accountType: 'asset' });
    const errors = validateMerge(source, target);
    expect(errors).toHaveLength(0);
  });

  it('rejects self-merge', () => {
    const account = makeAccount({ id: 'same', accountNumber: '10010' });
    const errors = validateMerge(account, account);
    expect(errors.some((e) => e.message.includes('itself'))).toBe(true);
  });

  it('rejects different account types', () => {
    const source = makeAccount({ id: 's1', accountType: 'asset' });
    const target = makeAccount({ id: 't1', accountType: 'liability' });
    const errors = validateMerge(source, target);
    expect(errors.some((e) => e.message.includes('different types'))).toBe(true);
  });

  it('rejects system account as source', () => {
    const source = makeAccount({ id: 's1', isSystemAccount: true });
    const target = makeAccount({ id: 't1' });
    const errors = validateMerge(source, target);
    expect(errors.some((e) => e.message.includes('system or fallback'))).toBe(true);
  });

  it('rejects fallback account as source', () => {
    const source = makeAccount({ id: 's1', isFallback: true });
    const target = makeAccount({ id: 't1' });
    const errors = validateMerge(source, target);
    expect(errors.some((e) => e.message.includes('system or fallback'))).toBe(true);
  });

  it('rejects inactive target', () => {
    const source = makeAccount({ id: 's1' });
    const target = makeAccount({ id: 't1', isActive: false, status: 'inactive' });
    const errors = validateMerge(source, target);
    expect(errors.some((e) => e.message.includes('active'))).toBe(true);
  });

  it('rejects already pending-merge source', () => {
    const source = makeAccount({ id: 's1', status: 'pending_merge' });
    const target = makeAccount({ id: 't1' });
    const errors = validateMerge(source, target);
    expect(errors.some((e) => e.message.includes('pending merge'))).toBe(true);
  });
});

// ── validateDeactivation ────────────────────────────────────────

describe('validateDeactivation', () => {
  it('passes for normal account with no dependencies', () => {
    const account = makeAccount();
    const { errors, warnings } = validateDeactivation(account, [], false, [], []);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('blocks system account deactivation', () => {
    const account = makeAccount({ isSystemAccount: true });
    const { errors } = validateDeactivation(account, [], false, [], []);
    expect(errors.some((e) => e.message.includes('system or fallback'))).toBe(true);
  });

  it('blocks fallback account deactivation', () => {
    const account = makeAccount({ isFallback: true });
    const { errors } = validateDeactivation(account, [], false, [], []);
    expect(errors.some((e) => e.message.includes('system or fallback'))).toBe(true);
  });

  it('blocks when active children exist', () => {
    const account = makeAccount();
    const child = makeAccount({ id: 'child', parentAccountId: 'acct-1' });
    const { errors } = validateDeactivation(account, [child], false, [], []);
    expect(errors.some((e) => e.message.includes('active child'))).toBe(true);
  });

  it('blocks when referenced in settings', () => {
    const account = makeAccount();
    const { errors } = validateDeactivation(
      account,
      [],
      false,
      ['defaultAPControlAccountId'],
      [],
    );
    expect(errors.some((e) => e.message.includes('accounting settings'))).toBe(true);
  });

  it('blocks when referenced in GL mappings', () => {
    const account = makeAccount();
    const { errors } = validateDeactivation(
      account,
      [],
      false,
      [],
      ['Sub-Department: Food'],
    );
    expect(errors.some((e) => e.message.includes('GL mappings'))).toBe(true);
  });

  it('warns when journal lines exist', () => {
    const account = makeAccount();
    const { errors, warnings } = validateDeactivation(account, [], true, [], []);
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.message.includes('journal lines'))).toBe(true);
  });

  it('accumulates multiple errors', () => {
    const account = makeAccount({ isSystemAccount: true });
    const child = makeAccount({ id: 'child', parentAccountId: 'acct-1' });
    const { errors } = validateDeactivation(
      account,
      [child],
      false,
      ['defaultRetainedEarningsAccountId'],
      ['Payment Type: Cash'],
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
