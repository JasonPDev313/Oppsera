import { describe, it, expect } from 'vitest';
import { parseCsvContent, extractSampleRows, detectDelimiter } from '../../services/csv-import/csv-parser';

describe('csv-parser', () => {
  describe('detectDelimiter', () => {
    it('detects comma delimiter', () => {
      expect(detectDelimiter('Name,Email,Phone')).toBe(',');
    });

    it('detects tab delimiter', () => {
      expect(detectDelimiter('Name\tEmail\tPhone')).toBe('\t');
    });

    it('prefers tab when more tabs than commas', () => {
      expect(detectDelimiter('Name\tEmail, Address\tPhone')).toBe('\t');
    });
  });

  describe('parseCsvContent', () => {
    it('parses simple CSV', () => {
      const csv = 'Name,Email\nJohn,john@test.com\nJane,jane@test.com';
      const result = parseCsvContent(csv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.headers).toEqual(['Name', 'Email']);
        expect(result.data.rows).toHaveLength(2);
        expect(result.data.rows[0]).toEqual(['John', 'john@test.com']);
        expect(result.data.totalRows).toBe(2);
        expect(result.data.delimiter).toBe(',');
      }
    });

    it('handles BOM character', () => {
      const csv = '\uFEFFName,Email\nJohn,john@test.com';
      const result = parseCsvContent(csv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.headers).toEqual(['Name', 'Email']);
      }
    });

    it('handles quoted fields with commas', () => {
      const csv = 'Name,Address\nJohn,"123 Main St, Suite 4"';
      const result = parseCsvContent(csv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.rows[0]).toEqual(['John', '123 Main St, Suite 4']);
      }
    });

    it('handles escaped quotes', () => {
      const csv = 'Name,Note\nJohn,"He said ""hello"""';
      const result = parseCsvContent(csv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.rows[0]![1]).toBe('He said "hello"');
      }
    });

    it('handles CRLF line endings', () => {
      const csv = 'Name,Email\r\nJohn,john@test.com\r\nJane,jane@test.com';
      const result = parseCsvContent(csv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.rows).toHaveLength(2);
      }
    });

    it('parses TSV content', () => {
      const tsv = 'Name\tEmail\nJohn\tjohn@test.com';
      const result = parseCsvContent(tsv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.delimiter).toBe('\t');
        expect(result.data.headers).toEqual(['Name', 'Email']);
      }
    });

    it('skips completely empty rows', () => {
      const csv = 'Name,Email\nJohn,john@test.com\n,,\nJane,jane@test.com';
      const result = parseCsvContent(csv);
      expect('data' in result).toBe(true);
      if ('data' in result) {
        expect(result.data.rows).toHaveLength(2);
      }
    });

    it('returns error for header-only file', () => {
      const csv = 'Name,Email';
      const result = parseCsvContent(csv);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.message).toContain('at least one data row');
      }
    });

    it('returns error for single-column file', () => {
      const csv = 'Name\nJohn';
      const result = parseCsvContent(csv);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.message).toContain('at least 2 columns');
      }
    });

    it('returns error for file exceeding size limit', () => {
      const bigContent = 'A'.repeat(11 * 1024 * 1024); // 11MB
      const result = parseCsvContent(bigContent);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.message).toContain('10MB limit');
      }
    });

    it('returns error when all data rows are empty', () => {
      const csv = 'Name,Email\n,,\n,,';
      const result = parseCsvContent(csv);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error.message).toContain('No data rows');
      }
    });
  });

  describe('extractSampleRows', () => {
    it('returns up to N rows', () => {
      const rows = Array.from({ length: 50 }, (_, i) => [`row${i}`]);
      expect(extractSampleRows(rows, 20)).toHaveLength(20);
    });

    it('returns all rows when fewer than N', () => {
      const rows = [['a'], ['b'], ['c']];
      expect(extractSampleRows(rows, 20)).toHaveLength(3);
    });
  });
});
