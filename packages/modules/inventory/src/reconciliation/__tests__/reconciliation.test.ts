import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) => {
    const mockTx = { execute: mockExecute };
    return fn(mockTx);
  }),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (...args: unknown[]) => args,
    { raw: (str: string) => str },
  ),
}));

import { getInventoryMovementsSummary, getReceivingPurchasesTotals } from '../index';

describe('Inventory Reconciliation', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getInventoryMovementsSummary', () => {
    it('returns beginning and ending inventory values', async () => {
      mockExecute
        .mockResolvedValueOnce([{ total: '15000.00' }])   // beginning
        .mockResolvedValueOnce([{ total: '18000.00' }]);   // ending

      const result = await getInventoryMovementsSummary('t1', undefined, '2025-01-01', '2025-01-31');

      expect(result).toEqual({
        beginningInventoryDollars: 15000,
        endingInventoryDollars: 18000,
      });
      expect(typeof result.beginningInventoryDollars).toBe('number');
      expect(typeof result.endingInventoryDollars).toBe('number');
    });

    it('handles zero inventory', async () => {
      mockExecute
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([{ total: '0' }]);

      const result = await getInventoryMovementsSummary('t1', 'loc1', '2025-01-01', '2025-01-31');

      expect(result.beginningInventoryDollars).toBe(0);
      expect(result.endingInventoryDollars).toBe(0);
    });

    it('handles empty result (no movements)', async () => {
      mockExecute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await getInventoryMovementsSummary('t1', undefined, '2025-01-01', '2025-01-31');

      expect(result.beginningInventoryDollars).toBe(0);
      expect(result.endingInventoryDollars).toBe(0);
    });
  });

  describe('getReceivingPurchasesTotals', () => {
    it('returns total purchases for the period', async () => {
      mockExecute.mockResolvedValueOnce([{ total: '5250.75' }]);

      const result = await getReceivingPurchasesTotals('t1', '2025-01-01', '2025-01-31');

      expect(result).toBe(5250.75);
      expect(typeof result).toBe('number');
    });

    it('returns zero when no receipts in period', async () => {
      mockExecute.mockResolvedValueOnce([{ total: '0' }]);

      const result = await getReceivingPurchasesTotals('t1', '2025-01-01', '2025-01-31');

      expect(result).toBe(0);
    });

    it('handles empty result set', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await getReceivingPurchasesTotals('t1', '2025-01-01', '2025-01-31');

      expect(result).toBe(0);
    });
  });
});
