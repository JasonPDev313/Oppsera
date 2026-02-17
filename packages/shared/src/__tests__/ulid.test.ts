import { describe, it, expect } from 'vitest';
import { generateUlid, isValidUlid } from '../utils/ulid';

describe('ULID utilities', () => {
  describe('generateUlid', () => {
    it('generates a 26-character string', () => {
      const id = generateUlid();
      expect(id).toHaveLength(26);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateUlid()));
      expect(ids.size).toBe(100);
    });

    it('generates sortable IDs', () => {
      const id1 = generateUlid();
      const id2 = generateUlid();
      expect(id2 >= id1).toBe(true);
    });
  });

  describe('isValidUlid', () => {
    it('returns true for valid ULIDs', () => {
      const id = generateUlid();
      expect(isValidUlid(id)).toBe(true);
    });

    it('returns false for invalid strings', () => {
      expect(isValidUlid('')).toBe(false);
      expect(isValidUlid('too-short')).toBe(false);
      expect(isValidUlid('not-a-valid-ulid-at-all!!!!')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidUlid(null as unknown as string)).toBe(false);
      expect(isValidUlid(undefined as unknown as string)).toBe(false);
    });
  });
});
