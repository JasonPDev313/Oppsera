import { describe, it, expect } from 'vitest';
import { analyzeColumns } from '../services/analysis-engine';
import { parseCsv } from '../services/csv-parser';

describe('analysis-engine', () => {
  function analyze(csv: string) {
    const parsed = parseCsv(csv);
    return analyzeColumns(parsed);
  }

  describe('data type detection', () => {
    it('detects numeric columns', () => {
      const result = analyze('Amount,Name\n100,Alice\n200,Bob\n300,Charlie');
      const amount = result.columns.find((c) => c.name === 'Amount');
      expect(amount?.dataType).toBe('number');
    });

    it('detects string columns', () => {
      const result = analyze('Amount,Name\n100,Alice\n200,Bob');
      const name = result.columns.find((c) => c.name === 'Name');
      expect(name?.dataType).toBe('string');
    });

    it('detects currency columns', () => {
      const result = analyze('Total,Name\n$100.00,Alice\n$200.50,Bob');
      const total = result.columns.find((c) => c.name === 'Total');
      expect(total?.dataType).toBe('currency');
    });

    it('detects date columns (ISO format)', () => {
      const result = analyze('Date,Name\n2024-01-01,Alice\n2024-02-15,Bob');
      const date = result.columns.find((c) => c.name === 'Date');
      expect(date?.dataType).toBe('date');
    });

    it('detects date columns (US format)', () => {
      const result = analyze('Date,Name\n01/15/2024,Alice\n02/28/2024,Bob');
      const date = result.columns.find((c) => c.name === 'Date');
      expect(date?.dataType).toBe('date');
    });

    it('detects boolean columns', () => {
      const result = analyze('Active,Name\ntrue,Alice\nfalse,Bob\ntrue,Charlie');
      const active = result.columns.find((c) => c.name === 'Active');
      expect(active?.dataType).toBe('boolean');
    });
  });

  describe('grouping key detection', () => {
    it('detects transaction_id as suggested grouping key', () => {
      const result = analyze('transaction_id,item,price\nT1,Widget,10\nT1,Gadget,20\nT2,Widget,10');
      expect(result.suggestedGroupingKey).toBe('transaction_id');
    });

    it('detects order_no as suggested grouping key', () => {
      const result = analyze('order_no,product,amount\n1001,A,10\n1001,B,20\n1002,A,15');
      expect(result.suggestedGroupingKey).toBe('order_no');
    });

    it('does not suggest all-unique columns as grouping key when name has no hints', () => {
      const result = analyze('row_id,group_id,val\n1,A,10\n2,A,20\n3,B,15');
      expect(result.suggestedGroupingKey).not.toBe('row_id');
    });
  });

  describe('column statistics', () => {
    it('computes unique count', () => {
      const result = analyze('Type,Amount\nCash,100\nCard,200\nCash,150\nCard,250');
      const type = result.columns.find((c) => c.name === 'Type');
      expect(type?.uniqueCount).toBe(2);
    });

    it('computes null count', () => {
      const result = analyze('A,B\n1,X\n2,\n3,Y\n4,');
      const b = result.columns.find((c) => c.name === 'B');
      expect(b?.nullCount).toBe(2);
    });

    it('extracts sample values', () => {
      const result = analyze('Name,Val\nAlice,1\nBob,2\nCharlie,3\nDave,4\nEve,5\nFrank,6');
      const name = result.columns.find((c) => c.name === 'Name');
      expect(name?.sampleValues.length).toBeLessThanOrEqual(5);
      expect(name?.sampleValues).toContain('Alice');
    });
  });
});
