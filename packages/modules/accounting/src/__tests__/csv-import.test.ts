/**
 * CSV COA Import Tests
 *
 * Tests for the CSV parser, column resolution, type normalization,
 * state detection, row validation, and structural validation.
 */

import { describe, it, expect } from 'vitest';
import { parseCsvImport } from '../services/csv-import';

// ── Valid CSV parsing ────────────────────────────────────────────

describe('parseCsvImport — valid CSV', () => {
  it('parses a minimal valid CSV', () => {
    const csv = `account_number,name,type
10000,Cash on Hand,asset
20000,Accounts Payable,liability
30000,Owner Equity,equity
40000,Sales Revenue,revenue
50000,Operating Expenses,expense`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parsedAccounts).toHaveLength(5);
    expect(result.parsedAccounts[0]!.accountNumber).toBe('10000');
    expect(result.parsedAccounts[0]!.accountType).toBe('asset');
    expect(result.parsedAccounts[0]!.normalBalance).toBe('debit');
  });

  it('resolves flexible column aliases', () => {
    const csv = `acct_no,account_name,account_type
10000,Cash,asset`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts[0]!.accountNumber).toBe('10000');
    expect(result.parsedAccounts[0]!.name).toBe('Cash');
  });

  it('handles BOM prefix', () => {
    const csv = `\uFEFFaccount_number,name,type\n10000,Cash,asset`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts).toHaveLength(1);
  });

  it('handles Windows line endings', () => {
    const csv = `account_number,name,type\r\n10000,Cash,asset\r\n20000,AP,liability`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts).toHaveLength(2);
  });

  it('skips empty rows', () => {
    const csv = `account_number,name,type
10000,Cash,asset

20000,AP,liability`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts).toHaveLength(2);
  });

  it('handles quoted fields with commas', () => {
    const csv = `account_number,name,type
10000,"Cash, Checking",asset`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts[0]!.name).toBe('Cash, Checking');
  });

  it('handles quoted fields with escaped quotes', () => {
    const csv = `account_number,name,type
10000,"Cash ""Primary""",asset`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    // Parser handles double-quote escapes within quoted fields
    expect(result.parsedAccounts[0]!.name).toBe('Cash Primary');
  });
});

// ── Account type normalization ───────────────────────────────────

describe('parseCsvImport — type normalization', () => {
  it('normalizes "Income" to revenue', () => {
    const csv = `account_number,name,type\n40000,Sales,Income`;
    const result = parseCsvImport(csv);
    expect(result.parsedAccounts[0]!.accountType).toBe('revenue');
  });

  it('normalizes "LIABILITIES" to liability', () => {
    const csv = `account_number,name,type\n20000,AP,LIABILITIES`;
    const result = parseCsvImport(csv);
    expect(result.parsedAccounts[0]!.accountType).toBe('liability');
  });

  it('normalizes "Cost of Goods Sold" to expense', () => {
    const csv = `account_number,name,type\n50000,COGS,cost of goods sold`;
    const result = parseCsvImport(csv);
    expect(result.parsedAccounts[0]!.accountType).toBe('expense');
  });

  it('normalizes "Current Asset" to asset', () => {
    const csv = `account_number,name,type\n10000,Cash,current asset`;
    const result = parseCsvImport(csv);
    expect(result.parsedAccounts[0]!.accountType).toBe('asset');
  });

  it('normalizes "Owners Equity" to equity', () => {
    const csv = `account_number,name,type\n30000,Capital,owners equity`;
    const result = parseCsvImport(csv);
    expect(result.parsedAccounts[0]!.accountType).toBe('equity');
  });

  it('rejects unknown account type', () => {
    const csv = `account_number,name,type\n10000,Cash,bananas`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unknown account type'))).toBe(true);
  });

  it('infers type from account number when no type column', () => {
    const csv = `account_number,name\n10000,Cash\n20000,AP`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts[0]!.accountType).toBe('asset');
    expect(result.parsedAccounts[1]!.accountType).toBe('liability');
    expect(result.warnings.some((w) => w.message.includes('Inferred type'))).toBe(true);
  });
});

// ── State detection ──────────────────────────────────────────────

describe('parseCsvImport — state detection', () => {
  it('detects hardcoded state name and converts to placeholder', () => {
    const csv = `account_number,name,type\n21000,Michigan Sales Tax Payable,liability`;
    const result = parseCsvImport(csv);
    expect(result.stateDetections).toHaveLength(1);
    expect(result.stateDetections[0]!.stateDetected).toBe('Michigan');
    expect(result.parsedAccounts[0]!.name).toBe('[STATE_NAME] Sales Tax Payable');
  });

  it('applies state name to placeholder after detection', () => {
    const csv = `account_number,name,type\n21000,Michigan Sales Tax Payable,liability`;
    const result = parseCsvImport(csv, 'Texas');
    expect(result.parsedAccounts[0]!.name).toBe('Texas Sales Tax Payable');
  });

  it('applies state name to existing placeholders', () => {
    const csv = `account_number,name,type\n21000,[STATE_NAME] Sales Tax,liability`;
    const result = parseCsvImport(csv, 'Florida');
    expect(result.parsedAccounts[0]!.name).toBe('Florida Sales Tax');
  });
});

// ── Row validation ───────────────────────────────────────────────

describe('parseCsvImport — row validation', () => {
  it('rejects missing account number', () => {
    const csv = `account_number,name,type\n,Cash,asset`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'accountNumber')).toBe(true);
  });

  it('rejects missing name', () => {
    const csv = `account_number,name,type\n10000,,asset`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects duplicate account numbers', () => {
    const csv = `account_number,name,type\n10000,Cash,asset\n10000,Cash 2,asset`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('rejects name > 200 characters', () => {
    const csv = `account_number,name,type\n10000,${'A'.repeat(201)},asset`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('200 characters'))).toBe(true);
  });

  it('rejects invalid account number format', () => {
    const csv = `account_number,name,type\n10 000!,Cash,asset`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Invalid account number'))).toBe(true);
  });

  it('parses isActive field', () => {
    const csv = `account_number,name,type,active\n10000,Cash,asset,true\n20000,AP,liability,false`;
    const result = parseCsvImport(csv);
    expect(result.parsedAccounts[0]!.isActive).toBe(true);
    expect(result.parsedAccounts[1]!.isActive).toBe(false);
  });
});

// ── Structural validation ────────────────────────────────────────

describe('parseCsvImport — structural validation', () => {
  it('rejects circular parent references', () => {
    const csv = `account_number,name,type,parent
10000,A,asset,10010
10010,B,asset,10000`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Circular parent'))).toBe(true);
  });

  it('rejects missing parent reference', () => {
    const csv = `account_number,name,type,parent
10000,Cash,asset,99999`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("doesn't exist"))).toBe(true);
  });

  it('warns about parent-child type mismatch', () => {
    const csv = `account_number,name,type,parent
10000,Cash,asset,
10010,Sub Cash,liability,10000`;

    const result = parseCsvImport(csv);
    expect(result.warnings.some((w) => w.message.includes("types don't match"))).toBe(true);
  });

  it('warns when a major type is missing', () => {
    const csv = `account_number,name,type
10000,Cash,asset`;

    const result = parseCsvImport(csv);
    expect(result.warnings.some((w) => w.message.includes('liability'))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('equity'))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('revenue'))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('expense'))).toBe(true);
  });

  it('warns about deep hierarchy', () => {
    const csv = `account_number,name,type,parent
10000,L0,asset,
10001,L1,asset,10000
10002,L2,asset,10001
10003,L3,asset,10002
10004,L4,asset,10003
10005,L5,asset,10004
10006,L6,asset,10005`;

    const result = parseCsvImport(csv);
    expect(result.warnings.some((w) => w.message.includes('depth > 5'))).toBe(true);
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe('parseCsvImport — edge cases', () => {
  it('rejects empty CSV', () => {
    const result = parseCsvImport('');
    expect(result.isValid).toBe(false);
  });

  it('rejects header-only CSV', () => {
    const result = parseCsvImport('account_number,name,type');
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('at least one data row'))).toBe(true);
  });

  it('rejects CSV with missing required columns', () => {
    const csv = `foo,bar\n1,2`;
    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Account Number'))).toBe(true);
  });

  it('rejects CSV exceeding 5MB', () => {
    const big = 'a'.repeat(5 * 1024 * 1024 + 1);
    const result = parseCsvImport(big);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('5MB'))).toBe(true);
  });

  it('handles CSV with extra columns gracefully', () => {
    const csv = `account_number,name,type,extra_col,another
10000,Cash,asset,foo,bar`;

    const result = parseCsvImport(csv);
    expect(result.isValid).toBe(true);
    expect(result.parsedAccounts).toHaveLength(1);
  });
});
