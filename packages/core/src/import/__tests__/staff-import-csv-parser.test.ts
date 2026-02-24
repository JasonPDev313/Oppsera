import { describe, it, expect } from 'vitest';
import { parseStaffCsv } from '../staff-import-csv-parser';

describe('parseStaffCsv', () => {
  it('parses a simple comma-delimited CSV', () => {
    const csv = 'First Name,Last Name,Email\nJohn,Doe,john@test.com\nJane,Smith,jane@test.com';
    const result = parseStaffCsv(csv);
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Email']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['John', 'Doe', 'john@test.com']);
    expect(result.delimiter).toBe(',');
  });

  it('strips UTF-8 BOM', () => {
    const csv = '\uFEFFName,Email\nAlice,alice@test.com';
    const result = parseStaffCsv(csv);
    expect(result.headers[0]).toBe('Name');
  });

  it('detects tab delimiter', () => {
    const csv = 'Name\tEmail\tRole\nJohn\tjohn@test.com\tManager';
    const result = parseStaffCsv(csv);
    expect(result.delimiter).toBe('\t');
    expect(result.rows[0]).toEqual(['John', 'john@test.com', 'Manager']);
  });

  it('detects semicolon delimiter', () => {
    const csv = 'Name;Email;Role\nJohn;john@test.com;Cashier';
    const result = parseStaffCsv(csv);
    expect(result.delimiter).toBe(';');
    expect(result.headers).toEqual(['Name', 'Email', 'Role']);
  });

  it('detects pipe delimiter', () => {
    const csv = 'Name|Email\nJohn|john@test.com';
    const result = parseStaffCsv(csv);
    expect(result.delimiter).toBe('|');
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Name,Title,Email\n"Doe, John","VP, Sales",john@test.com';
    const result = parseStaffCsv(csv);
    expect(result.rows[0]![0]).toBe('Doe, John');
    expect(result.rows[0]![1]).toBe('VP, Sales');
  });

  it('handles escaped quotes inside quoted fields', () => {
    const csv = 'Name,Note\n"He said ""hello""",ok';
    const result = parseStaffCsv(csv);
    expect(result.rows[0]![0]).toBe('He said "hello"');
  });

  it('handles CRLF line endings', () => {
    const csv = 'Name,Email\r\nJohn,john@test.com\r\nJane,jane@test.com';
    const result = parseStaffCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('skips empty lines', () => {
    const csv = 'Name,Email\nJohn,john@test.com\n\n\nJane,jane@test.com\n';
    const result = parseStaffCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('pads short rows to header length', () => {
    const csv = 'A,B,C\n1';
    const result = parseStaffCsv(csv);
    expect(result.rows[0]).toEqual(['1', '', '']);
  });

  it('throws on file with only header', () => {
    expect(() => parseStaffCsv('Name,Email')).toThrow('at least a header row');
  });

  it('throws on empty file', () => {
    expect(() => parseStaffCsv('')).toThrow('at least a header row');
  });

  it('throws on oversized file', () => {
    const big = 'A\n' + 'x'.repeat(6 * 1024 * 1024);
    expect(() => parseStaffCsv(big)).toThrow('too large');
  });

  it('respects 5000 row limit', () => {
    const header = 'Name';
    const rows = Array.from({ length: 6000 }, (_, i) => `User${i}`).join('\n');
    const csv = `${header}\n${rows}`;
    const result = parseStaffCsv(csv);
    expect(result.rows).toHaveLength(5000);
  });

  it('handles multiline quoted fields', () => {
    const csv = 'Name,Bio\n"John","Has a\nmultiline bio"\nJane,simple';
    const result = parseStaffCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]![1]).toBe('Has a\nmultiline bio');
  });

  it('trims header whitespace', () => {
    const csv = '  First Name  , Last Name ,  Email  \nJohn,Doe,john@test.com';
    const result = parseStaffCsv(csv);
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Email']);
  });
});
