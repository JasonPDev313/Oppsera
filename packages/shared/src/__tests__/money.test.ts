import { describe, it, expect } from 'vitest';
import { toCents, toDollars, addMoney, subtractMoney, multiplyMoney, formatMoney } from '../utils/money';

describe('money utilities', () => {
  describe('toCents', () => {
    it('converts dollars to cents', () => {
      expect(toCents(12.5)).toBe(1250);
      expect(toCents(0)).toBe(0);
      expect(toCents(99.99)).toBe(9999);
    });

    it('rounds to avoid floating point errors', () => {
      expect(toCents(0.1 + 0.2)).toBe(30);
    });
  });

  describe('toDollars', () => {
    it('converts cents to dollars', () => {
      expect(toDollars(1250)).toBe(12.5);
      expect(toDollars(0)).toBe(0);
      expect(toDollars(9999)).toBe(99.99);
    });
  });

  describe('addMoney', () => {
    it('adds multiple dollar amounts', () => {
      expect(addMoney(10.1, 20.2)).toBe(30.3);
      expect(addMoney(0.1, 0.2)).toBe(0.3);
    });

    it('handles single amount', () => {
      expect(addMoney(5.5)).toBe(5.5);
    });

    it('handles no amounts', () => {
      expect(addMoney()).toBe(0);
    });
  });

  describe('subtractMoney', () => {
    it('subtracts dollar amounts', () => {
      expect(subtractMoney(20.5, 10.3)).toBe(10.2);
      expect(subtractMoney(0.3, 0.1)).toBe(0.2);
    });
  });

  describe('multiplyMoney', () => {
    it('multiplies dollar amount by quantity', () => {
      expect(multiplyMoney(10.5, 3)).toBe(31.5);
      expect(multiplyMoney(0.1, 10)).toBe(1);
    });
  });

  describe('formatMoney', () => {
    it('formats as USD with 2 decimal places', () => {
      expect(formatMoney(12.5)).toBe('$12.50');
      expect(formatMoney(0)).toBe('$0.00');
      expect(formatMoney(1000)).toBe('$1000.00');
      expect(formatMoney(99.99)).toBe('$99.99');
    });
  });
});
