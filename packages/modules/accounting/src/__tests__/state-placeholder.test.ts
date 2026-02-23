/**
 * State Placeholder Engine Tests
 *
 * Tests for the state placeholder system that resolves [STATE_NAME]
 * in COA account template names.
 */

import { describe, it, expect } from 'vitest';
import {
  replaceStatePlaceholder,
  convertHardcodedStateToPlaceholder,
  applyStatePlaceholders,
  detectAndConvertStates,
  resolveState,
  isValidStateName,
  STATE_PLACEHOLDER,
} from '../services/state-placeholder';

// ── replaceStatePlaceholder ───────────────────────────────────────

describe('replaceStatePlaceholder', () => {
  it('replaces [STATE_NAME] with actual state name', () => {
    expect(replaceStatePlaceholder('[STATE_NAME] Sales Tax Payable', 'Michigan')).toBe(
      'Michigan Sales Tax Payable',
    );
  });

  it('replaces multiple occurrences', () => {
    expect(
      replaceStatePlaceholder('[STATE_NAME] Tax - [STATE_NAME] Filing', 'Texas'),
    ).toBe('Texas Tax - Texas Filing');
  });

  it('returns unchanged if no placeholder present', () => {
    expect(replaceStatePlaceholder('Cash on Hand', 'Michigan')).toBe('Cash on Hand');
  });

  it('returns unchanged if stateName is empty', () => {
    expect(replaceStatePlaceholder('[STATE_NAME] Sales Tax', '')).toBe(
      '[STATE_NAME] Sales Tax',
    );
  });

  it('handles empty account name', () => {
    expect(replaceStatePlaceholder('', 'Michigan')).toBe('');
  });
});

// ── convertHardcodedStateToPlaceholder ────────────────────────────

describe('convertHardcodedStateToPlaceholder', () => {
  it('detects full state name', () => {
    const result = convertHardcodedStateToPlaceholder('Michigan Sales Tax Payable');
    expect(result.stateDetected).toBe('Michigan');
    expect(result.converted).toBe('[STATE_NAME] Sales Tax Payable');
  });

  it('detects multi-word state name', () => {
    const result = convertHardcodedStateToPlaceholder('New York Withholding Tax');
    expect(result.stateDetected).toBe('New York');
    expect(result.converted).toBe('[STATE_NAME] Withholding Tax');
  });

  it('detects state name case-insensitively', () => {
    const result = convertHardcodedStateToPlaceholder('CALIFORNIA income tax');
    expect(result.stateDetected).toBe('California');
    expect(result.converted).toContain(STATE_PLACEHOLDER);
  });

  it('detects abbreviation in tax context', () => {
    const result = convertHardcodedStateToPlaceholder('MI Unemployment Tax');
    expect(result.stateDetected).toBe('Michigan');
    expect(result.converted).toBe('[STATE_NAME] Unemployment Tax');
  });

  it('does NOT detect abbreviation outside tax context', () => {
    // "IN" is Indiana abbreviation but also a common English preposition
    const result = convertHardcodedStateToPlaceholder('Cash IN Transit');
    expect(result.stateDetected).toBeNull();
    expect(result.converted).toBe('Cash IN Transit');
  });

  it('does NOT detect "OR" without tax context', () => {
    const result = convertHardcodedStateToPlaceholder('Debit OR Credit Account');
    expect(result.stateDetected).toBeNull();
    expect(result.converted).toBe('Debit OR Credit Account');
  });

  it('returns unchanged if no state detected', () => {
    const result = convertHardcodedStateToPlaceholder('Accounts Receivable');
    expect(result.stateDetected).toBeNull();
    expect(result.converted).toBe('Accounts Receivable');
  });

  it('detects abbreviation with tax keyword present', () => {
    const result = convertHardcodedStateToPlaceholder('TX Sales Tax Payable');
    expect(result.stateDetected).toBe('Texas');
    expect(result.converted).toBe('[STATE_NAME] Sales Tax Payable');
  });
});

// ── resolveState ──────────────────────────────────────────────────

describe('resolveState', () => {
  it('resolves abbreviation to state', () => {
    const result = resolveState('MI');
    expect(result).toEqual({ name: 'Michigan', abbrev: 'MI' });
  });

  it('resolves full name case-insensitively', () => {
    const result = resolveState('michigan');
    expect(result).toEqual({ name: 'Michigan', abbrev: 'MI' });
  });

  it('resolves with leading/trailing spaces', () => {
    const result = resolveState('  TX  ');
    expect(result).toEqual({ name: 'Texas', abbrev: 'TX' });
  });

  it('returns null for invalid state', () => {
    expect(resolveState('Narnia')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveState('')).toBeNull();
  });

  it('resolves District of Columbia', () => {
    const result = resolveState('DC');
    expect(result).toEqual({ name: 'District of Columbia', abbrev: 'DC' });
  });
});

// ── isValidStateName ──────────────────────────────────────────────

describe('isValidStateName', () => {
  it('returns true for valid abbreviation', () => {
    expect(isValidStateName('CA')).toBe(true);
  });

  it('returns true for valid full name', () => {
    expect(isValidStateName('California')).toBe(true);
  });

  it('returns false for invalid input', () => {
    expect(isValidStateName('Atlantis')).toBe(false);
  });
});

// ── applyStatePlaceholders ────────────────────────────────────────

describe('applyStatePlaceholders', () => {
  it('applies state name to all accounts with placeholders', () => {
    const accounts = [
      { name: '[STATE_NAME] Sales Tax' },
      { name: 'Cash on Hand' },
      { name: '[STATE_NAME] Unemployment Tax' },
    ];
    const result = applyStatePlaceholders(accounts, 'Michigan');
    expect(result[0]!.name).toBe('Michigan Sales Tax');
    expect(result[1]!.name).toBe('Cash on Hand');
    expect(result[2]!.name).toBe('Michigan Unemployment Tax');
  });

  it('returns unchanged if stateName is empty', () => {
    const accounts = [{ name: '[STATE_NAME] Sales Tax' }];
    const result = applyStatePlaceholders(accounts, '');
    expect(result[0]!.name).toBe('[STATE_NAME] Sales Tax');
  });

  it('preserves other properties', () => {
    const accounts = [{ name: '[STATE_NAME] Tax', type: 'liability', id: '123' }];
    const result = applyStatePlaceholders(accounts, 'Texas');
    expect(result[0]).toEqual({ name: 'Texas Tax', type: 'liability', id: '123' });
  });
});

// ── detectAndConvertStates ────────────────────────────────────────

describe('detectAndConvertStates', () => {
  it('detects and converts hardcoded states in batch', () => {
    const accounts = [
      { name: 'Michigan Sales Tax Payable' },
      { name: 'Cash on Hand' },
      { name: 'New York Withholding Tax' },
    ];
    const result = detectAndConvertStates(accounts);
    expect(result.detections).toHaveLength(2);
    expect(result.detections[0]!.stateDetected).toBe('Michigan');
    expect(result.detections[1]!.stateDetected).toBe('New York');
    expect(result.accounts[0]!.name).toBe('[STATE_NAME] Sales Tax Payable');
    expect(result.accounts[1]!.name).toBe('Cash on Hand');
  });

  it('returns empty detections when no states found', () => {
    const accounts = [{ name: 'Accounts Receivable' }, { name: 'Cash' }];
    const result = detectAndConvertStates(accounts);
    expect(result.detections).toHaveLength(0);
    expect(result.accounts[0]!.name).toBe('Accounts Receivable');
  });
});
