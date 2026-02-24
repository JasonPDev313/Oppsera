import { describe, it, expect } from 'vitest';
import { processStagedsRows } from '../services/import-processor';
import type { StagedRow } from '../services/staging-engine';

describe('import-processor', () => {
  function makeStagedRow(overrides: Partial<StagedRow>): StagedRow {
    return {
      rowNumber: 1,
      groupKey: 'T1',
      entityType: 'order_header',
      parsedData: {},
      ...overrides,
    };
  }

  describe('processStagedsRows', () => {
    it('converts staged rows into processed orders', () => {
      const stagedRows: StagedRow[] = [
        makeStagedRow({
          groupKey: 'T1',
          entityType: 'order_header',
          parsedData: {
            businessDate: '2024-01-15',
            total: 2000,
            subtotal: 1800,
          },
        }),
        makeStagedRow({
          rowNumber: 2,
          groupKey: 'T1',
          entityType: 'order_line',
          parsedData: {
            catalogItemName: 'Widget',
            qty: 2,
            unitPrice: 900,
            lineTotal: 1800,
          },
        }),
        makeStagedRow({
          rowNumber: 3,
          groupKey: 'T1',
          entityType: 'tender',
          parsedData: {
            tenderType: 'Cash',
            amount: 2000,
          },
        }),
      ];

      const tenderMappings = new Map([['Cash', 'cash']]);
      const itemMappings = new Map<string, { catalogItemId: string | null; strategy: string }>();

      const result = processStagedsRows(
        stagedRows,
        'job-123',
        tenderMappings,
        itemMappings,
      );

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]!.groupKey).toBe('T1');
      expect(result.orders[0]!.lines).toHaveLength(1);
      expect(result.orders[0]!.lines[0]!.catalogItemName).toBe('Widget');
      expect(result.orders[0]!.tenders).toHaveLength(1);
      expect(result.orders[0]!.tenders[0]!.tenderType).toBe('cash');
    });

    it('groups multiple staged rows into separate orders', () => {
      const stagedRows: StagedRow[] = [
        makeStagedRow({ groupKey: 'T1', entityType: 'order_header', parsedData: { total: 3000 } }),
        makeStagedRow({ rowNumber: 2, groupKey: 'T1', entityType: 'order_line', parsedData: { catalogItemName: 'A', qty: 1, unitPrice: 1000 } }),
        makeStagedRow({ rowNumber: 3, groupKey: 'T1', entityType: 'order_line', parsedData: { catalogItemName: 'B', qty: 1, unitPrice: 2000 } }),
        makeStagedRow({ rowNumber: 4, groupKey: 'T1', entityType: 'tender', parsedData: { tenderType: 'Card', amount: 3000 } }),
        makeStagedRow({ rowNumber: 5, groupKey: 'T2', entityType: 'order_header', parsedData: { total: 1500 } }),
        makeStagedRow({ rowNumber: 6, groupKey: 'T2', entityType: 'order_line', parsedData: { catalogItemName: 'C', qty: 1, unitPrice: 1500 } }),
        makeStagedRow({ rowNumber: 7, groupKey: 'T2', entityType: 'tender', parsedData: { tenderType: 'Cash', amount: 1500 } }),
      ];

      const result = processStagedsRows(stagedRows, 'job-123', new Map(), new Map());
      expect(result.orders).toHaveLength(2);
      expect(result.orders[0]!.lines).toHaveLength(2);
      expect(result.orders[1]!.lines).toHaveLength(1);
    });

    it('applies tender type mappings', () => {
      const stagedRows: StagedRow[] = [
        makeStagedRow({ groupKey: 'T1', entityType: 'order_header', parsedData: { total: 1000 } }),
        makeStagedRow({ rowNumber: 2, groupKey: 'T1', entityType: 'order_line', parsedData: { catalogItemName: 'A', qty: 1, unitPrice: 1000 } }),
        makeStagedRow({ rowNumber: 3, groupKey: 'T1', entityType: 'tender', parsedData: { tenderType: 'Visa', amount: 1000 } }),
      ];

      const tenderMappings = new Map([['Visa', 'card']]);

      const result = processStagedsRows(stagedRows, 'job-123', tenderMappings, new Map());
      expect(result.orders[0]!.tenders[0]!.tenderType).toBe('card');
    });

    it('tags orders with import metadata', () => {
      const stagedRows: StagedRow[] = [
        makeStagedRow({ groupKey: 'T1', entityType: 'order_header', parsedData: { total: 1000 } }),
        makeStagedRow({ rowNumber: 2, groupKey: 'T1', entityType: 'order_line', parsedData: { catalogItemName: 'A', qty: 1, unitPrice: 1000 } }),
        makeStagedRow({ rowNumber: 3, groupKey: 'T1', entityType: 'tender', parsedData: { tenderType: 'Cash', amount: 1000 } }),
      ];

      const result = processStagedsRows(stagedRows, 'job-456', new Map(), new Map());
      expect(result.orders[0]!.metadata.importJobId).toBe('job-456');
      expect(result.orders[0]!.metadata.legacyTransactionId).toBe('T1');
      expect(result.orders[0]!.metadata.isLegacyImport).toBe(true);
    });

    it('handles empty input', () => {
      const result = processStagedsRows([], 'job-123', new Map(), new Map());
      expect(result.orders).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('creates fallback tender when none provided', () => {
      const stagedRows: StagedRow[] = [
        makeStagedRow({ groupKey: 'T1', entityType: 'order_header', parsedData: { total: 1000 } }),
        makeStagedRow({ rowNumber: 2, groupKey: 'T1', entityType: 'order_line', parsedData: { catalogItemName: 'A', qty: 1, unitPrice: 1000 } }),
      ];

      const result = processStagedsRows(stagedRows, 'job-123', new Map(), new Map());
      expect(result.orders[0]!.tenders).toHaveLength(1);
      expect(result.orders[0]!.tenders[0]!.tenderType).toBe('other');
      expect(result.errors.some((e) => e.category === 'missing_tender')).toBe(true);
    });
  });
});
