import { describe, it, expect } from 'vitest';
import {
  splitFullName,
  splitCityStateZip,
  coerceBoolean,
  coerceDate,
  coerceGender,
  coerceStatus,
  parseCurrencyToCents,
  parseTags,
  normalizePhone,
  detectEntityType,
} from '../../services/csv-import/data-transforms';

describe('data-transforms', () => {
  describe('splitFullName', () => {
    it('splits simple "First Last"', () => {
      const result = splitFullName('John Smith');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.prefix).toBeUndefined();
      expect(result.suffix).toBeUndefined();
    });

    it('handles name with prefix', () => {
      const result = splitFullName('Dr. Jane Smith');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
    });

    it('handles name with suffix', () => {
      const result = splitFullName('John Smith Jr.');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.suffix).toBe('Jr.');
    });

    it('handles name with prefix and suffix', () => {
      const result = splitFullName('Dr. Jane Smith PhD');
      expect(result.prefix).toBe('Dr.');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(result.suffix).toBe('PhD');
    });

    it('handles middle name', () => {
      const result = splitFullName('Mary Jane Watson');
      expect(result.firstName).toBe('Mary Jane');
      expect(result.lastName).toBe('Watson');
    });

    it('handles single name', () => {
      const result = splitFullName('Madonna');
      expect(result.firstName).toBe('Madonna');
      expect(result.lastName).toBe('');
    });

    it('returns empty for empty string', () => {
      const result = splitFullName('');
      expect(result.firstName).toBe('');
      expect(result.lastName).toBe('');
    });

    it('trims whitespace', () => {
      const result = splitFullName('  John   Smith  ');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });
  });

  describe('splitCityStateZip', () => {
    it('parses "City, ST 12345"', () => {
      const result = splitCityStateZip('Phoenix, AZ 85001');
      expect(result.city).toBe('Phoenix');
      expect(result.state).toBe('AZ');
      expect(result.postalCode).toBe('85001');
    });

    it('parses "City, ST 12345-6789"', () => {
      const result = splitCityStateZip('Denver, CO 80202-1234');
      expect(result.city).toBe('Denver');
      expect(result.state).toBe('CO');
      expect(result.postalCode).toBe('80202-1234');
    });

    it('parses "City, ST" (no zip)', () => {
      const result = splitCityStateZip('New York, NY');
      expect(result.city).toBe('New York');
      expect(result.state).toBe('NY');
      expect(result.postalCode).toBe('');
    });

    it('returns city only when no comma', () => {
      const result = splitCityStateZip('Springfield');
      expect(result.city).toBe('Springfield');
      expect(result.state).toBe('');
      expect(result.postalCode).toBe('');
    });

    it('handles empty string', () => {
      const result = splitCityStateZip('');
      expect(result.city).toBe('');
      expect(result.state).toBe('');
      expect(result.postalCode).toBe('');
    });
  });

  describe('coerceBoolean', () => {
    it.each([
      ['true', true], ['yes', true], ['y', true], ['1', true], ['on', true],
      ['false', false], ['no', false], ['n', false], ['0', false], ['off', false],
    ])('"%s" → %s', (input, expected) => {
      expect(coerceBoolean(input)).toBe(expected);
    });

    it('returns null for unrecognized values', () => {
      expect(coerceBoolean('maybe')).toBeNull();
      expect(coerceBoolean('')).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(coerceBoolean('YES')).toBe(true);
      expect(coerceBoolean('True')).toBe(true);
    });
  });

  describe('coerceDate', () => {
    it('parses ISO YYYY-MM-DD', () => {
      expect(coerceDate('2024-01-15')).toBe('2024-01-15');
    });

    it('parses ISO with time', () => {
      const result = coerceDate('2024-01-15T10:30:00Z');
      expect(result).toBe('2024-01-15');
    });

    it('parses US format MM/DD/YYYY', () => {
      expect(coerceDate('01/15/2024')).toBe('2024-01-15');
    });

    it('parses US format M/D/YYYY', () => {
      expect(coerceDate('1/5/2024')).toBe('2024-01-05');
    });

    it('parses dashes MM-DD-YYYY', () => {
      expect(coerceDate('01-15-2024')).toBe('2024-01-15');
    });

    it('parses 2-digit year (>= 50 → 19xx)', () => {
      expect(coerceDate('01/15/85')).toBe('1985-01-15');
    });

    it('parses 2-digit year (< 50 → 20xx)', () => {
      expect(coerceDate('01/15/24')).toBe('2024-01-15');
    });

    it('returns null for empty', () => {
      expect(coerceDate('')).toBeNull();
    });

    it('returns null for garbage', () => {
      expect(coerceDate('not-a-date')).toBeNull();
    });
  });

  describe('coerceGender', () => {
    it.each([
      ['M', 'male'], ['Male', 'male'], ['F', 'female'], ['Female', 'female'],
      ['NB', 'non_binary'], ['Non-Binary', 'non_binary'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(coerceGender(input)).toBe(expected);
    });

    it('returns null for unknown', () => {
      expect(coerceGender('xyz')).toBeNull();
    });
  });

  describe('coerceStatus', () => {
    it.each([
      ['Active', 'active'], ['A', 'active'],
      ['Inactive', 'inactive'], ['I', 'inactive'],
      ['Prospect', 'prospect'], ['Suspended', 'suspended'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(coerceStatus(input)).toBe(expected);
    });

    it('returns null for unknown', () => {
      expect(coerceStatus('xyz')).toBeNull();
    });
  });

  describe('parseCurrencyToCents', () => {
    it('parses "$1,250.50" → 125050', () => {
      expect(parseCurrencyToCents('$1,250.50')).toBe(125050);
    });

    it('parses "1250.50" → 125050', () => {
      expect(parseCurrencyToCents('1250.50')).toBe(125050);
    });

    it('parses negative "-500" → -50000', () => {
      expect(parseCurrencyToCents('-500')).toBe(-50000);
    });

    it('parses "0" → 0', () => {
      expect(parseCurrencyToCents('0')).toBe(0);
    });

    it('returns null for empty', () => {
      expect(parseCurrencyToCents('')).toBeNull();
    });

    it('returns null for garbage', () => {
      expect(parseCurrencyToCents('abc')).toBeNull();
    });
  });

  describe('parseTags', () => {
    it('splits by comma', () => {
      expect(parseTags('VIP, Golf, Premium')).toEqual(['VIP', 'Golf', 'Premium']);
    });

    it('splits by semicolon', () => {
      expect(parseTags('VIP;Golf;Premium')).toEqual(['VIP', 'Golf', 'Premium']);
    });

    it('splits by pipe', () => {
      expect(parseTags('VIP|Golf|Premium')).toEqual(['VIP', 'Golf', 'Premium']);
    });

    it('returns empty for empty string', () => {
      expect(parseTags('')).toEqual([]);
    });

    it('trims whitespace', () => {
      expect(parseTags('  VIP , Golf  ')).toEqual(['VIP', 'Golf']);
    });
  });

  describe('normalizePhone', () => {
    it('normalizes (555) 123-4567', () => {
      expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
    });

    it('preserves leading +', () => {
      expect(normalizePhone('+1-555-123-4567')).toBe('+15551234567');
    });

    it('returns empty for empty string', () => {
      expect(normalizePhone('')).toBe('');
    });
  });

  describe('detectEntityType', () => {
    it('returns person when firstName is present', () => {
      expect(detectEntityType('John', 'Smith', undefined)).toBe('person');
    });

    it('returns organization when only orgName is present', () => {
      expect(detectEntityType(undefined, undefined, 'Acme Corp')).toBe('organization');
    });

    it('returns person when both org and name are present', () => {
      expect(detectEntityType('John', 'Smith', 'Acme Corp')).toBe('person');
    });
  });
});
