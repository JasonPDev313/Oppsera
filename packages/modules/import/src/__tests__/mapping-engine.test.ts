import { describe, it, expect } from 'vitest';
import { autoMapColumns, getTargetFieldsForEntity } from '../services/mapping-engine';
import { analyzeColumns } from '../services/analysis-engine';
import { parseCsv } from '../services/csv-parser';

describe('mapping-engine', () => {
  function mapColumns(csv: string) {
    const parsed = parseCsv(csv);
    const analysis = analyzeColumns(parsed);
    return autoMapColumns(analysis.columns);
  }

  describe('autoMapColumns', () => {
    it('maps common column names with high confidence', () => {
      const mappings = mapColumns(
        'transaction_id,date,item_name,quantity,unit_price,payment_type,payment_amount,tax\nT1,2024-01-01,Widget,1,10.00,Cash,10.50,0.50',
      );

      const txId = mappings.find((m) => m.sourceColumn === 'transaction_id');
      expect(txId?.targetEntity).toBe('order');
      expect(txId?.targetField).toBe('groupingKey');
      expect(txId?.confidence).toBeGreaterThanOrEqual(0.8);

      const date = mappings.find((m) => m.sourceColumn === 'date');
      expect(date?.targetEntity).toBe('order');
      expect(date?.targetField).toBe('businessDate');

      const itemName = mappings.find((m) => m.sourceColumn === 'item_name');
      expect(itemName?.targetEntity).toBe('line');
      expect(itemName?.targetField).toBe('catalogItemName');

      const qty = mappings.find((m) => m.sourceColumn === 'quantity');
      expect(qty?.targetEntity).toBe('line');
      expect(qty?.targetField).toBe('qty');

      const payType = mappings.find((m) => m.sourceColumn === 'payment_type');
      expect(payType?.targetEntity).toBe('tender');
      expect(payType?.targetField).toBe('tenderType');
    });

    it('maps exact field name matches', () => {
      const mappings = mapColumns('sku,total,subtotal\nABC,100,90');

      const sku = mappings.find((m) => m.sourceColumn === 'sku');
      expect(sku?.targetEntity).toBe('line');
      expect(sku?.targetField).toBe('catalogItemSku');

      const total = mappings.find((m) => m.sourceColumn === 'total');
      expect(total?.targetEntity).toBe('order');
    });

    it('assigns transform rules for currency fields', () => {
      const mappings = mapColumns('total,item_price\n$100.00,$9.99');
      const total = mappings.find((m) => m.sourceColumn === 'total');
      expect(total?.transformRule).toBe('dollars_to_cents');
    });

    it('assigns transform rules for date fields', () => {
      const mappings = mapColumns('sale_date,amount\n01/15/2024,100');
      const date = mappings.find((m) => m.sourceColumn === 'sale_date');
      expect(date?.transformRule).toBe('date_parse');
    });

    it('maps unknown columns as ignore with low confidence', () => {
      const mappings = mapColumns('xyz_random_column,amount\nfoo,100');
      const unknown = mappings.find((m) => m.sourceColumn === 'xyz_random_column');
      expect(unknown).toBeDefined();
    });
  });

  describe('getTargetFieldsForEntity', () => {
    it('returns fields for order entity', () => {
      const fields = getTargetFieldsForEntity('order');
      expect(fields).toContain('businessDate');
      expect(fields).toContain('total');
    });

    it('returns fields for line entity', () => {
      const fields = getTargetFieldsForEntity('line');
      expect(fields).toContain('catalogItemName');
      expect(fields).toContain('qty');
    });

    it('returns fields for tender entity', () => {
      const fields = getTargetFieldsForEntity('tender');
      expect(fields).toContain('tenderType');
      expect(fields).toContain('amount');
    });
  });
});
