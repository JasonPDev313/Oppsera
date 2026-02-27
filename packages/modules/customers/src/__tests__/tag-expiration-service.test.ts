import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted Mocks ──────────────────────────────────────────────────────
const { mockSelect, mockUpdate, mockInsert } = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }
  const mockSelect = vi.fn(() => makeSelectChain());
  const mockUpdate = vi.fn();
  const mockInsert = vi.fn();

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  mockInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });

  return { mockSelect, mockUpdate, mockInsert, makeSelectChain };
});

vi.mock('@oppsera/db', () => ({
  customerTags: {
    id: 'customer_tags.id',
    tenantId: 'customer_tags.tenant_id',
    customerId: 'customer_tags.customer_id',
    tagId: 'customer_tags.tag_id',
    expiresAt: 'customer_tags.expires_at',
    removedAt: 'customer_tags.removed_at',
  },
  tags: {
    id: 'tags.id',
    name: 'tags.name',
    tenantId: 'tags.tenant_id',
    customerCount: 'tags.customer_count',
    updatedAt: 'tags.updated_at',
  },
  tagAuditLog: {
    id: 'tag_audit_log.id',
    tenantId: 'tag_audit_log.tenant_id',
    customerId: 'tag_audit_log.customer_id',
    tagId: 'tag_audit_log.tag_id',
    action: 'tag_audit_log.action',
    source: 'tag_audit_log.source',
    actorId: 'tag_audit_log.actor_id',
    evidence: 'tag_audit_log.evidence',
  },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ulid-mock-001'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  lte: vi.fn((col: unknown, val: unknown) => ({ type: 'lte', col, val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values }),
    { raw: (s: string) => ({ type: 'sql_raw', s }) },
  ),
}));

import { processExpiredTags, computeExpiryDate } from '../services/tag-expiration-service';

function makeTx() {
  return {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  };
}

describe('Tag Expiration Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default update/insert chains
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  // ── computeExpiryDate ──────────────────────────────────────────

  describe('computeExpiryDate', () => {
    it('returns null when no default expiry days', () => {
      expect(computeExpiryDate(null)).toBeNull();
      expect(computeExpiryDate(undefined)).toBeNull();
      expect(computeExpiryDate(0)).toBeNull();
      expect(computeExpiryDate(-5)).toBeNull();
    });

    it('computes expiry from current date', () => {
      const before = Date.now();
      const result = computeExpiryDate(30);
      const after = Date.now();

      expect(result).toBeInstanceOf(Date);
      const expectedMin = before + 30 * 86400000;
      const expectedMax = after + 30 * 86400000;
      expect(result!.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result!.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('computes expiry from a given base date', () => {
      const base = new Date('2026-01-01T00:00:00Z');
      const result = computeExpiryDate(7, base);
      expect(result).toEqual(new Date('2026-01-08T00:00:00Z'));
    });

    it('computes single-day expiry', () => {
      const base = new Date('2026-06-15T12:00:00Z');
      const result = computeExpiryDate(1, base);
      expect(result).toEqual(new Date('2026-06-16T12:00:00Z'));
    });

    it('computes 365-day expiry', () => {
      const base = new Date('2026-01-01T00:00:00Z');
      const result = computeExpiryDate(365, base);
      expect(result!.getTime() - base.getTime()).toBe(365 * 86400000);
    });
  });

  // ── processExpiredTags ─────────────────────────────────────────

  describe('processExpiredTags', () => {
    it('returns empty result when no expired tags', async () => {
      // Select returns no expired rows
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([])),
      };
      mockSelect.mockReturnValueOnce(chain as any);

      const result = await processExpiredTags(makeTx(), 'tenant-1');
      expect(result.processed).toBe(0);
      expect(result.expired).toHaveLength(0);
    });

    it('processes expired tags and returns results', async () => {
      const expiredRows = [
        {
          customerTagId: 'ct-1',
          customerId: 'cust-1',
          tagId: 'tag-1',
          expiresAt: new Date('2026-01-15T00:00:00Z'),
          tagName: 'VIP 30-day',
        },
      ];

      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve(expiredRows)),
      };
      mockSelect.mockReturnValueOnce(chain as any);

      const result = await processExpiredTags(makeTx(), 'tenant-1');

      expect(result.processed).toBe(1);
      expect(result.expired).toHaveLength(1);
      expect(result.expired[0]!.tagName).toBe('VIP 30-day');
      expect(result.expired[0]!.customerId).toBe('cust-1');

      // Verify update was called (soft-remove)
      expect(mockUpdate).toHaveBeenCalled();
      // Verify audit log insert
      expect(mockInsert).toHaveBeenCalled();
    });

    it('respects batch size limit', async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([])),
      };
      mockSelect.mockReturnValueOnce(chain as any);

      await processExpiredTags(makeTx(), 'tenant-1', 50);

      // Verify limit was called with the batch size
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('decrements customer count for expired tags', async () => {
      const expiredRows = [
        {
          customerTagId: 'ct-1',
          customerId: 'cust-1',
          tagId: 'tag-1',
          expiresAt: new Date('2026-01-15T00:00:00Z'),
          tagName: 'Promo',
        },
        {
          customerTagId: 'ct-2',
          customerId: 'cust-2',
          tagId: 'tag-1', // Same tag — should decrement by 2
          expiresAt: new Date('2026-01-15T00:00:00Z'),
          tagName: 'Promo',
        },
      ];

      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve(expiredRows)),
      };
      mockSelect.mockReturnValueOnce(chain as any);

      const result = await processExpiredTags(makeTx(), 'tenant-1');

      expect(result.processed).toBe(2);
      // Update called: 2 soft-removes + 1 count decrement = 3
      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });

    it('handles string expiresAt gracefully', async () => {
      const expiredRows = [
        {
          customerTagId: 'ct-1',
          customerId: 'cust-1',
          tagId: 'tag-1',
          expiresAt: '2026-01-15T00:00:00.000Z', // String, not Date
          tagName: 'Temp Tag',
        },
      ];

      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve(expiredRows)),
      };
      mockSelect.mockReturnValueOnce(chain as any);

      const result = await processExpiredTags(makeTx(), 'tenant-1');
      expect(result.expired[0]!.expiresAt).toBe('2026-01-15T00:00:00.000Z');
    });
  });
});
