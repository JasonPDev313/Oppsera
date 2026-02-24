import { describe, it, expect } from 'vitest';
import { parseCsv, extractSampleRows, getColumnValues } from '../services/csv-parser';

describe('csv-parser', () => {
  describe('parseCsv', () => {
    it('parses a simple CSV', () => {
      const csv = 'Name,Amount,Date\nAlice,100,2024-01-01\nBob,200,2024-01-02';
      const result = parseCsv(csv);
      expect(result.headers).toEqual(['Name', 'Amount', 'Date']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['Alice', '100', '2024-01-01']);
      expect(result.rows[1]).toEqual(['Bob', '200', '2024-01-02']);
      expect(result.rowCount).toBe(2);
      expect(result.delimiter).toBe(',');
    });

    it('strips BOM from UTF-8 content', () => {
      const csv = '\uFEFFName,Amount\nAlice,100';
      const result = parseCsv(csv);
      expect(result.headers).toEqual(['Name', 'Amount']);
      expect(result.rows).toHaveLength(1);
    });

    it('detects tab delimiter', () => {
      const csv = 'Name\tAmount\tDate\nAlice\t100\t2024-01-01';
      const result = parseCsv(csv);
      expect(result.delimiter).toBe('\t');
      expect(result.headers).toEqual(['Name', 'Amount', 'Date']);
    });

    it('detects semicolon delimiter', () => {
      const csv = 'Name;Amount;Date\nAlice;100;2024-01-01';
      const result = parseCsv(csv);
      expect(result.delimiter).toBe(';');
    });

    it('handles quoted fields with commas inside', () => {
      const csv = 'Name,Description,Price\n"Smith, John","A ""great"" item",19.99';
      const result = parseCsv(csv);
      expect(result.rows[0]![0]).toBe('Smith, John');
      expect(result.rows[0]![1]).toBe('A "great" item');
      expect(result.rows[0]![2]).toBe('19.99');
    });

    it('handles Windows line endings (CRLF)', () => {
      const csv = 'Name,Amount\r\nAlice,100\r\nBob,200';
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(2);
    });

    it('skips empty trailing lines', () => {
      const csv = 'Name,Amount\nAlice,100\n\n\n';
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(1);
    });

    it('throws on content with only headers', () => {
      expect(() => parseCsv('Name,Amount')).toThrow('at least one data row');
    });

    it('throws on single-column CSV', () => {
      expect(() => parseCsv('Name\nAlice')).toThrow('at least 2 columns');
    });
  });

  describe('extractSampleRows', () => {
    it('returns first N rows', () => {
      const csv = 'A,B\n1,2\n3,4\n5,6\n7,8\n9,10';
      const parsed = parseCsv(csv);
      const sample = extractSampleRows(parsed, 3);
      expect(sample).toHaveLength(3);
      expect(sample[0]).toEqual(['1', '2']);
      expect(sample[2]).toEqual(['5', '6']);
    });
  });

  describe('getColumnValues', () => {
    it('returns values for a column by index', () => {
      const csv = 'Type,Amount\nCash,100\nCard,200\nCash,150';
      const parsed = parseCsv(csv);
      const values = getColumnValues(parsed.rows, 0);
      expect(values).toEqual(['Cash', 'Card', 'Cash']);
    });
  });
});
