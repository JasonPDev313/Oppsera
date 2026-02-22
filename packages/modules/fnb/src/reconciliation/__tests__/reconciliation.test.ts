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

import { getFnbCloseStatus } from '../index';

describe('F&B Reconciliation', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getFnbCloseStatus', () => {
    it('returns total and unposted counts', async () => {
      mockExecute.mockResolvedValueOnce([{ total: 5, unposted: 2 }]);

      const result = await getFnbCloseStatus('t1', '2025-01');

      expect(result).toEqual({ total: 5, unposted: 2 });
      expect(typeof result.total).toBe('number');
      expect(typeof result.unposted).toBe('number');
    });

    it('returns zeros when no batches exist', async () => {
      mockExecute.mockResolvedValueOnce([{ total: 0, unposted: 0 }]);

      const result = await getFnbCloseStatus('t1', '2025-01');

      expect(result.total).toBe(0);
      expect(result.unposted).toBe(0);
    });

    it('returns all posted when unposted is zero', async () => {
      mockExecute.mockResolvedValueOnce([{ total: 3, unposted: 0 }]);

      const result = await getFnbCloseStatus('t1', '2025-02');

      expect(result.total).toBe(3);
      expect(result.unposted).toBe(0);
    });

    it('handles empty result set', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await getFnbCloseStatus('t1', '2025-01');

      expect(result.total).toBe(0);
      expect(result.unposted).toBe(0);
    });
  });
});
