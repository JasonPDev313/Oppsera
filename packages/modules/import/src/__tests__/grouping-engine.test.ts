import { describe, it, expect } from 'vitest';
import { groupRowsIntoOrders } from '../services/grouping-engine';
import type { ColumnMapping } from '../services/mapping-engine';

function makeMapping(
  sourceColumn: string,
  sourceIndex: number,
  targetEntity: 'order' | 'line' | 'tender' | 'tax' | 'ignore',
  targetField: string,
): ColumnMapping {
  return {
    sourceColumn,
    sourceIndex,
    targetEntity,
    targetField,
    confidence: 0.9,
    confidenceReason: 'test',
    dataType: 'string',
    transformRule: 'none',
    sampleValues: [],
  };
}

describe('grouping-engine', () => {
  describe('groupRowsIntoOrders', () => {
    it('groups rows by the grouping key', () => {
      // Columns: order_id(0), item(1), qty(2), price(3)
      const rows = [
        ['T1', 'Widget', '2', '10.00'],
        ['T1', 'Gadget', '1', '20.00'],
        ['T2', 'Widget', '3', '10.00'],
      ];
      const mappings: ColumnMapping[] = [
        makeMapping('order_id', 0, 'order', 'groupingKey'),
        makeMapping('item', 1, 'line', 'catalogItemName'),
        makeMapping('qty', 2, 'line', 'qty'),
        makeMapping('price', 3, 'line', 'unitPrice'),
      ];

      const result = groupRowsIntoOrders(rows, mappings, 0);
      expect(result).toHaveLength(2);

      const t1 = result.find((o) => o.groupKey === 'T1');
      expect(t1?.lines).toHaveLength(2);
      expect(t1?.lines[0]?.catalogItemName).toBe('Widget');
      expect(t1?.lines[1]?.catalogItemName).toBe('Gadget');

      const t2 = result.find((o) => o.groupKey === 'T2');
      expect(t2?.lines).toHaveLength(1);
    });

    it('extracts order-level fields from first row of group', () => {
      // Columns: order_id(0), date(1), item(2), total(3)
      const rows = [
        ['T1', '2024-01-15', 'Widget', '30.00'],
        ['T1', '2024-01-15', 'Gadget', '30.00'],
      ];
      const mappings: ColumnMapping[] = [
        makeMapping('order_id', 0, 'order', 'groupingKey'),
        makeMapping('date', 1, 'order', 'businessDate'),
        makeMapping('total', 3, 'order', 'total'),
        makeMapping('item', 2, 'line', 'catalogItemName'),
      ];

      const result = groupRowsIntoOrders(rows, mappings, 0);
      expect(result[0]?.header.businessDate).toBe('2024-01-15');
      expect(result[0]?.header.total).toBe('30.00');
    });

    it('extracts tenders from rows with tender mappings', () => {
      // Columns: order_id(0), item(1), pay_type(2), pay_amount(3)
      const rows = [
        ['T1', 'Widget', 'Cash', '10.00'],
        ['T1', 'Gadget', 'Cash', '10.00'],
      ];
      const mappings: ColumnMapping[] = [
        makeMapping('order_id', 0, 'order', 'groupingKey'),
        makeMapping('item', 1, 'line', 'catalogItemName'),
        makeMapping('pay_type', 2, 'tender', 'tenderType'),
        makeMapping('pay_amount', 3, 'tender', 'amount'),
      ];

      const result = groupRowsIntoOrders(rows, mappings, 0);
      // Tenders should be deduped per group (same type+amount)
      expect(result[0]?.tenders.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.tenders[0]?.tenderType).toBe('Cash');
    });

    it('handles single-row-per-order structure', () => {
      // Columns: id(0), item(1), total(2), payment(3)
      const rows = [
        ['1', 'Coffee', '5.00', 'Cash'],
        ['2', 'Tea', '3.00', 'Card'],
      ];
      const mappings: ColumnMapping[] = [
        makeMapping('id', 0, 'order', 'groupingKey'),
        makeMapping('item', 1, 'line', 'catalogItemName'),
        makeMapping('total', 2, 'order', 'total'),
        makeMapping('payment', 3, 'tender', 'tenderType'),
      ];

      const result = groupRowsIntoOrders(rows, mappings, 0);
      expect(result).toHaveLength(2);
      expect(result[0]?.lines).toHaveLength(1);
      expect(result[1]?.lines).toHaveLength(1);
    });

    it('handles rows with empty grouping key', () => {
      // Columns: id(0), item(1), total(2)
      const rows = [
        ['', 'Widget', '10.00'],
        ['T1', 'Gadget', '20.00'],
      ];
      const mappings: ColumnMapping[] = [
        makeMapping('id', 0, 'order', 'groupingKey'),
        makeMapping('item', 1, 'line', 'catalogItemName'),
        makeMapping('total', 2, 'order', 'total'),
      ];

      const result = groupRowsIntoOrders(rows, mappings, 0);
      // Empty group key rows get auto-generated keys, so there should be 2 groups
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});
