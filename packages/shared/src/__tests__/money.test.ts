import { describe, it, expect } from 'vitest';
import {
  toCents,
  toDollars,
  addMoney,
  subtractMoney,
  multiplyMoney,
  formatMoney,
  formatCents,
  formatCentsRaw,
  formatDollarsLocale,
  formatCentsLocale,
  formatDollarString,
  formatCompact,
} from '../utils/money';

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
    it('formats dollars as USD with 2 decimal places', () => {
      expect(formatMoney(12.5)).toBe('$12.50');
      expect(formatMoney(0)).toBe('$0.00');
      expect(formatMoney(1000)).toBe('$1000.00');
      expect(formatMoney(99.99)).toBe('$99.99');
    });
  });

  describe('formatCents', () => {
    it('formats cents as USD display string', () => {
      expect(formatCents(1250)).toBe('$12.50');
      expect(formatCents(0)).toBe('$0.00');
      expect(formatCents(999)).toBe('$9.99');
      expect(formatCents(100)).toBe('$1.00');
    });

    it('handles negative cents', () => {
      expect(formatCents(-500)).toBe('-$5.00');
    });
  });

  describe('formatCentsRaw', () => {
    it('formats cents without dollar sign', () => {
      expect(formatCentsRaw(1250)).toBe('12.50');
      expect(formatCentsRaw(0)).toBe('0.00');
      expect(formatCentsRaw(99)).toBe('0.99');
    });
  });

  describe('formatDollarsLocale', () => {
    it('formats dollars with thousands separator', () => {
      expect(formatDollarsLocale(1234.5)).toBe('$1,234.50');
      expect(formatDollarsLocale(0)).toBe('$0.00');
      expect(formatDollarsLocale(1000000)).toBe('$1,000,000.00');
    });
  });

  describe('formatCentsLocale', () => {
    it('formats cents with thousands separator', () => {
      expect(formatCentsLocale(123450)).toBe('$1,234.50');
      expect(formatCentsLocale(0)).toBe('$0.00');
    });
  });

  describe('formatDollarString', () => {
    it('formats Drizzle NUMERIC string', () => {
      expect(formatDollarString('12.50')).toBe('$12.50');
      expect(formatDollarString('0')).toBe('$0.00');
      expect(formatDollarString('99.9')).toBe('$99.90');
    });

    it('returns dash for null/undefined/empty', () => {
      expect(formatDollarString(null)).toBe('—');
      expect(formatDollarString(undefined)).toBe('—');
      expect(formatDollarString('')).toBe('—');
    });
  });

  describe('formatCompact', () => {
    it('formats millions', () => {
      expect(formatCompact(1200000)).toBe('$1.2M');
      expect(formatCompact(5500000)).toBe('$5.5M');
    });

    it('formats thousands', () => {
      expect(formatCompact(45000)).toBe('$45.0K');
      expect(formatCompact(1500)).toBe('$1.5K');
    });

    it('formats small amounts', () => {
      expect(formatCompact(123)).toBe('$123');
      expect(formatCompact(0)).toBe('$0');
    });

    it('handles negative amounts', () => {
      expect(formatCompact(-1200000)).toBe('-$1.2M');
      expect(formatCompact(-500)).toBe('-$500');
    });
  });
});
