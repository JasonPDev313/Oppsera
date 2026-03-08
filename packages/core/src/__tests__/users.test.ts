import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  normalizeUsername,
  validatePin,
  validatePinStrength,
  validateOverridePin,
  validateOverridePinStrength,
  hashSecret,
  verifySecret,
} from '../users';

describe('user management helpers', () => {
  it('normalizes email and username', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
    expect(normalizeUsername('  Manager.One  ')).toBe('manager.one');
  });

  it('validates unique ID PIN format (exactly 4 digits)', () => {
    expect(validatePin('1234')).toBe(true);
    expect(validatePin('0000')).toBe(true);
    expect(validatePin('123')).toBe(false);
    expect(validatePin('12345')).toBe(false);
    expect(validatePin('12345678')).toBe(false);
    expect(validatePin('12ab')).toBe(false);
  });

  it('rejects weak unique ID PINs', () => {
    // Common patterns
    expect(validatePinStrength('0000')).toBeTruthy();
    expect(validatePinStrength('1111')).toBeTruthy();
    expect(validatePinStrength('1234')).toBeTruthy();
    expect(validatePinStrength('4321')).toBeTruthy();
    expect(validatePinStrength('1212')).toBeTruthy();
    expect(validatePinStrength('6969')).toBeTruthy();
    // Sequential runs
    expect(validatePinStrength('3456')).toBeTruthy();
    expect(validatePinStrength('9876')).toBeTruthy();
    // Strong PINs
    expect(validatePinStrength('7392')).toBeNull();
    expect(validatePinStrength('5081')).toBeNull();
    expect(validatePinStrength('2947')).toBeNull();
  });

  it('validates override PIN format (4-8 digits)', () => {
    expect(validateOverridePin('1234')).toBe(true);
    expect(validateOverridePin('123456')).toBe(true);
    expect(validateOverridePin('12345678')).toBe(true);
    expect(validateOverridePin('123')).toBe(false);
    expect(validateOverridePin('123456789')).toBe(false);
    expect(validateOverridePin('12ab')).toBe(false);
  });

  it('rejects weak override PINs', () => {
    expect(validateOverridePinStrength('0000')).toBeTruthy();
    expect(validateOverridePinStrength('1111')).toBeTruthy();
    expect(validateOverridePinStrength('11111111')).toBeTruthy(); // all same digit
    expect(validateOverridePinStrength('12345678')).toBeTruthy(); // sequential
    // Strong override PINs
    expect(validateOverridePinStrength('739258')).toBeNull();
    expect(validateOverridePinStrength('50814723')).toBeNull();
  });

  it('hashes and verifies secrets without plaintext storage', () => {
    const hash = hashSecret('MyS3cret!');
    expect(hash).toContain('scrypt$');
    expect(hash.includes('MyS3cret!')).toBe(false);
    expect(verifySecret('MyS3cret!', hash)).toBe(true);
    expect(verifySecret('wrong', hash)).toBe(false);
  });
});
