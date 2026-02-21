import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  normalizeUsername,
  validatePin,
  hashSecret,
  verifySecret,
} from '../users';

describe('user management helpers', () => {
  it('normalizes email and username', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
    expect(normalizeUsername('  Manager.One  ')).toBe('manager.one');
  });

  it('validates PIN format', () => {
    expect(validatePin('1234')).toBe(true);
    expect(validatePin('12345678')).toBe(true);
    expect(validatePin('123')).toBe(false);
    expect(validatePin('123456789')).toBe(false);
    expect(validatePin('12ab')).toBe(false);
  });

  it('hashes and verifies secrets without plaintext storage', () => {
    const hash = hashSecret('MyS3cret!');
    expect(hash).toContain('scrypt$');
    expect(hash.includes('MyS3cret!')).toBe(false);
    expect(verifySecret('MyS3cret!', hash)).toBe(true);
    expect(verifySecret('wrong', hash)).toBe(false);
  });
});
