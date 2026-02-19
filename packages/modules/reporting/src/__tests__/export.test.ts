import { describe, it, expect } from 'vitest';
import { toCsv } from '../csv-export';
import type { CsvColumn } from '../csv-export';

const COLUMNS: CsvColumn[] = [
  { key: 'date', label: 'Business Date' },
  { key: 'name', label: 'Item Name' },
  { key: 'amount', label: 'Amount' },
];

describe('toCsv', () => {
  it('generates header row from column labels', () => {
    const buffer = toCsv(COLUMNS, []);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    // First char is BOM (\uFEFF), then header
    expect(lines[0]).toBe('\uFEFFBusiness Date,Item Name,Amount');
  });

  it('maps row values by column key', () => {
    const rows = [
      { date: '2026-03-15', name: 'Burger', amount: 12.5 },
      { date: '2026-03-15', name: 'Fries', amount: 5.0 },
    ];

    const buffer = toCsv(COLUMNS, rows);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    expect(lines[1]).toBe('2026-03-15,Burger,12.5');
    expect(lines[2]).toBe('2026-03-15,Fries,5');
  });

  it('escapes fields containing commas', () => {
    const rows = [{ date: '2026-03-15', name: 'Burger, Deluxe', amount: 15 }];

    const buffer = toCsv(COLUMNS, rows);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    expect(lines[1]).toBe('2026-03-15,"Burger, Deluxe",15');
  });

  it('escapes fields containing double quotes', () => {
    const rows = [{ date: '2026-03-15', name: '8" Pizza', amount: 12 }];

    const buffer = toCsv(COLUMNS, rows);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    expect(lines[1]).toBe('2026-03-15,"8"" Pizza",12');
  });

  it('escapes fields containing newlines', () => {
    const rows = [{ date: '2026-03-15', name: 'Line1\nLine2', amount: 10 }];

    const buffer = toCsv(COLUMNS, rows);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    // The field with a newline should be quoted
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('handles null and undefined values as empty strings', () => {
    const rows = [{ date: '2026-03-15', name: null, amount: undefined }];

    const buffer = toCsv(COLUMNS, rows as any);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    expect(lines[1]).toBe('2026-03-15,,');
  });

  it('handles missing keys as empty strings', () => {
    const rows = [{ date: '2026-03-15' }];

    const buffer = toCsv(COLUMNS, rows as any);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    expect(lines[1]).toBe('2026-03-15,,');
  });

  it('includes UTF-8 BOM as first bytes', () => {
    const buffer = toCsv(COLUMNS, []);
    // BOM is EF BB BF in UTF-8
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
  });

  it('returns a Buffer', () => {
    const result = toCsv(COLUMNS, []);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('uses CRLF line endings', () => {
    const rows = [{ date: '2026-03-15', name: 'Burger', amount: 12 }];

    const buffer = toCsv(COLUMNS, rows);
    const csv = buffer.toString('utf-8');

    // Should have CRLF between header and data
    expect(csv).toContain('\r\n');
    // Should not have bare LF (except within escaped fields)
    const withoutQuoted = csv.replace(/"[^"]*"/g, '');
    expect(withoutQuoted).not.toMatch(/[^\r]\n/);
  });

  it('ends with a trailing CRLF', () => {
    const rows = [{ date: '2026-03-15', name: 'X', amount: 1 }];

    const buffer = toCsv(COLUMNS, rows);
    const csv = buffer.toString('utf-8');

    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('escapes header labels containing special characters', () => {
    const specialColumns: CsvColumn[] = [
      { key: 'a', label: 'Revenue, Net' },
      { key: 'b', label: 'Normal' },
    ];

    const buffer = toCsv(specialColumns, []);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('\uFEFF"Revenue, Net",Normal');
  });
});
