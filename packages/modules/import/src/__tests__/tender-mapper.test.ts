import { describe, it, expect } from 'vitest';
import { autoMapTenders } from '../services/tender-mapper';

describe('tender-mapper', () => {
  describe('autoMapTenders', () => {
    it('maps common cash values', () => {
      const result = autoMapTenders(['Cash', 'CASH', 'Money']);
      expect(result.find((r) => r.legacyValue === 'Cash')?.oppseraTenderType).toBe('cash');
      expect(result.find((r) => r.legacyValue === 'CASH')?.oppseraTenderType).toBe('cash');
      expect(result.find((r) => r.legacyValue === 'Money')?.oppseraTenderType).toBe('cash');
    });

    it('maps credit card values', () => {
      const result = autoMapTenders(['Visa', 'Mastercard', 'Credit Card', 'Debit', 'MC', 'Amex']);
      expect(result.find((r) => r.legacyValue === 'Visa')?.oppseraTenderType).toBe('card');
      expect(result.find((r) => r.legacyValue === 'Mastercard')?.oppseraTenderType).toBe('card');
      expect(result.find((r) => r.legacyValue === 'Credit Card')?.oppseraTenderType).toBe('card');
      expect(result.find((r) => r.legacyValue === 'Amex')?.oppseraTenderType).toBe('card');
    });

    it('maps gift card values', () => {
      const result = autoMapTenders(['Gift Card', 'GC', 'Gift Certificate', 'Store Credit']);
      expect(result.find((r) => r.legacyValue === 'Gift Card')?.oppseraTenderType).toBe('gift_card');
      expect(result.find((r) => r.legacyValue === 'GC')?.oppseraTenderType).toBe('gift_card');
    });

    it('maps house account values', () => {
      const result = autoMapTenders(['House Account', 'On Account', 'Member Charge', 'AR']);
      expect(result.find((r) => r.legacyValue === 'House Account')?.oppseraTenderType).toBe('house_account');
      expect(result.find((r) => r.legacyValue === 'AR')?.oppseraTenderType).toBe('house_account');
    });

    it('maps online payment values', () => {
      const result = autoMapTenders(['PayPal', 'Apple Pay', 'Google Pay', 'Venmo']);
      result.forEach((r) => {
        expect(r.oppseraTenderType).toBe('online');
      });
    });

    it('falls back to other for truly unknown values', () => {
      // Values that don't substring-match any known tender alias
      // (avoid substrings like 'ar', 'cc', 'gc', 'web' that match aliases)
      const result = autoMapTenders(['Blimp', 'Zephyn']);
      result.forEach((r) => {
        expect(r.oppseraTenderType).toBe('other');
        expect(r.confidence).toBeLessThanOrEqual(0.3);
      });
    });

    it('returns high confidence for exact matches', () => {
      const result = autoMapTenders(['cash', 'card']);
      expect(result.find((r) => r.legacyValue === 'cash')?.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('handles empty array', () => {
      const result = autoMapTenders([]);
      expect(result).toEqual([]);
    });

    it('counts occurrences of duplicate values', () => {
      const result = autoMapTenders(['Cash', 'Cash', 'Cash', 'Card']);
      expect(result.find((r) => r.legacyValue === 'Cash')?.occurrenceCount).toBe(3);
      expect(result.find((r) => r.legacyValue === 'Card')?.occurrenceCount).toBe(1);
    });
  });
});
