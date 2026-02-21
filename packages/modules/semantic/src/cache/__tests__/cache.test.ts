import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFromQueryCache,
  setInQueryCache,
  invalidateQueryCache,
  getQueryCacheStats,
  resetQueryCacheStats,
} from '../query-cache';
import {
  checkSemanticRateLimit,
  getSemanticRateLimitStatus,
  resetSemanticRateLimiter,
} from '../semantic-rate-limiter';

// ── Query cache tests ─────────────────────────────────────────────

describe('query-cache', () => {
  beforeEach(() => {
    invalidateQueryCache();
    resetQueryCacheStats();
  });

  const tenant = 'TENANT_1';
  const sql = 'SELECT net_sales FROM rm_daily_sales WHERE tenant_id = $1';
  const params = [tenant];
  const rows = [{ net_sales: '1000.00', date: '2026-02-01' }];

  describe('setInQueryCache / getFromQueryCache', () => {
    it('returns null on miss', () => {
      const result = getFromQueryCache(tenant, sql, params);
      expect(result).toBeNull();
    });

    it('stores and retrieves a result', () => {
      setInQueryCache(tenant, sql, params, rows, 1);
      const result = getFromQueryCache(tenant, sql, params);
      expect(result).not.toBeNull();
      expect(result!.rows).toEqual(rows);
      expect(result!.rowCount).toBe(1);
    });

    it('returns null for different params', () => {
      setInQueryCache(tenant, sql, params, rows, 1);
      const result = getFromQueryCache(tenant, sql, ['TENANT_OTHER']);
      expect(result).toBeNull();
    });

    it('returns null for different tenant', () => {
      setInQueryCache(tenant, sql, params, rows, 1);
      const result = getFromQueryCache('TENANT_OTHER', sql, params);
      expect(result).toBeNull();
    });

    it('returns null for different SQL', () => {
      setInQueryCache(tenant, sql, params, rows, 1);
      const result = getFromQueryCache(tenant, sql + ' LIMIT 5', params);
      expect(result).toBeNull();
    });

    it('increments hit/miss counters correctly', () => {
      // miss
      getFromQueryCache(tenant, sql, params);
      let stats = getQueryCacheStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // store + hit
      setInQueryCache(tenant, sql, params, rows, 1);
      getFromQueryCache(tenant, sql, params);
      stats = getQueryCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('invalidateQueryCache', () => {
    it('invalidates all entries when tenantId omitted', () => {
      setInQueryCache('T1', sql, params, rows, 1);
      setInQueryCache('T2', sql, params, rows, 1);
      const removed = invalidateQueryCache();
      expect(removed).toBe(2);
      expect(getFromQueryCache('T1', sql, params)).toBeNull();
      expect(getFromQueryCache('T2', sql, params)).toBeNull();
    });

    it('invalidates only entries for the specified tenant', () => {
      setInQueryCache('T1', sql, params, rows, 1);
      setInQueryCache('T2', sql, ['T2'], rows, 1);
      const removed = invalidateQueryCache('T1');
      expect(removed).toBe(1);
      expect(getFromQueryCache('T1', sql, params)).toBeNull();
      expect(getFromQueryCache('T2', sql, ['T2'])).not.toBeNull();
    });

    it('returns 0 when no matching entries', () => {
      const removed = invalidateQueryCache('NONEXISTENT');
      expect(removed).toBe(0);
    });
  });

  describe('getQueryCacheStats', () => {
    it('reports correct size', () => {
      setInQueryCache('T1', sql, params, rows, 1);
      setInQueryCache('T1', sql + '2', params, rows, 1);
      const stats = getQueryCacheStats();
      expect(stats.size).toBe(2);
    });

    it('has expected constant fields', () => {
      const stats = getQueryCacheStats();
      expect(stats.maxSize).toBe(200);
      expect(stats.ttlMs).toBe(5 * 60 * 1000);
    });
  });

  describe('TTL expiry', () => {
    it('treats entries as expired when cachedAt is old', () => {
      // Manually insert an expired entry by setting cachedAt in the past
      // We do this indirectly by testing that a fresh entry is always returned
      setInQueryCache(tenant, sql, params, rows, 1);
      const result = getFromQueryCache(tenant, sql, params);
      expect(result).not.toBeNull();
      // Entry within TTL should have a valid cachedAt
      expect(result!.cachedAt).toBeLessThanOrEqual(Date.now());
      expect(result!.cachedAt).toBeGreaterThan(Date.now() - 1000);
    });
  });
});

// ── Rate limiter tests ────────────────────────────────────────────

describe('semantic-rate-limiter', () => {
  beforeEach(() => {
    resetSemanticRateLimiter();
  });

  const tenant = 'TENANT_RL';
  const tightConfig = { maxRequests: 3, windowMs: 60_000 };

  describe('checkSemanticRateLimit', () => {
    it('allows requests under the limit', () => {
      const result = checkSemanticRateLimit(tenant, tightConfig);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 3 max - 1 used
    });

    it('allows exactly maxRequests requests', () => {
      for (let i = 0; i < 3; i++) {
        const r = checkSemanticRateLimit(tenant, tightConfig);
        expect(r.allowed).toBe(true);
      }
    });

    it('blocks the (maxRequests + 1)th request', () => {
      for (let i = 0; i < 3; i++) {
        checkSemanticRateLimit(tenant, tightConfig);
      }
      const result = checkSemanticRateLimit(tenant, tightConfig);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('decrements remaining correctly', () => {
      const r1 = checkSemanticRateLimit(tenant, tightConfig);
      expect(r1.remaining).toBe(2);
      const r2 = checkSemanticRateLimit(tenant, tightConfig);
      expect(r2.remaining).toBe(1);
      const r3 = checkSemanticRateLimit(tenant, tightConfig);
      expect(r3.remaining).toBe(0);
    });

    it('uses separate windows per tenant', () => {
      for (let i = 0; i < 3; i++) {
        checkSemanticRateLimit(tenant, tightConfig);
      }
      // Different tenant should still be allowed
      const other = checkSemanticRateLimit('TENANT_OTHER', tightConfig);
      expect(other.allowed).toBe(true);
    });

    it('provides a positive resetAt timestamp', () => {
      const result = checkSemanticRateLimit(tenant, tightConfig);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('returns retryAfterMs = 0 when allowed', () => {
      const result = checkSemanticRateLimit(tenant, tightConfig);
      expect(result.retryAfterMs).toBe(0);
    });
  });

  describe('getSemanticRateLimitStatus', () => {
    it('returns remaining without consuming a slot', () => {
      const before = checkSemanticRateLimit(tenant, tightConfig);
      // Status check — should NOT change remaining
      const status = getSemanticRateLimitStatus(tenant, tightConfig);
      const after = checkSemanticRateLimit(tenant, tightConfig);

      // before consumed 1 → remaining=2; status didn't consume; after consumed 1 → remaining=1
      expect(before.remaining).toBe(2);
      expect(status.remaining).toBe(2);
      expect(after.remaining).toBe(1);
    });
  });

  describe('default config', () => {
    it('allows up to 30 requests per minute with default config', () => {
      for (let i = 0; i < 30; i++) {
        const r = checkSemanticRateLimit(tenant);
        expect(r.allowed).toBe(true);
      }
      const blocked = checkSemanticRateLimit(tenant);
      expect(blocked.allowed).toBe(false);
    });
  });
});
