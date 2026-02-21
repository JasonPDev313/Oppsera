import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSemanticRequest,
  getTenantMetrics,
  getGlobalMetrics,
  resetSemanticMetrics,
} from '../metrics';

describe('semantic observability metrics', () => {
  beforeEach(() => {
    resetSemanticMetrics();
  });

  function makeRecord(
    tenantId: string,
    overrides: Partial<Parameters<typeof recordSemanticRequest>[0]> = {},
  ) {
    return recordSemanticRequest({
      tenantId,
      latencyMs: 250,
      llmLatencyMs: 180,
      executionTimeMs: 50,
      tokensInput: 1200,
      tokensOutput: 300,
      cacheStatus: 'MISS',
      hadError: false,
      isClarification: false,
      ...overrides,
    });
  }

  describe('recordSemanticRequest', () => {
    it('does not throw', () => {
      expect(() => makeRecord('T1')).not.toThrow();
    });

    it('creates a tenant bucket on first record', () => {
      makeRecord('T1');
      expect(getTenantMetrics('T1')).not.toBeNull();
    });

    it('increments totalRequests', () => {
      makeRecord('T1');
      makeRecord('T1');
      expect(getTenantMetrics('T1')!.totalRequests).toBe(2);
    });

    it('tracks cache hits vs misses', () => {
      makeRecord('T1', { cacheStatus: 'HIT' });
      makeRecord('T1', { cacheStatus: 'HIT' });
      makeRecord('T1', { cacheStatus: 'MISS' });
      const m = getTenantMetrics('T1')!;
      expect(m.cacheHits).toBe(2);
      expect(m.cacheMisses).toBe(1);
      expect(m.cacheHitRate).toBeCloseTo(2 / 3);
    });

    it('accumulates token counts', () => {
      makeRecord('T1', { tokensInput: 1000, tokensOutput: 200 });
      makeRecord('T1', { tokensInput: 500, tokensOutput: 100 });
      const m = getTenantMetrics('T1')!;
      expect(m.totalTokensIn).toBe(1500);
      expect(m.totalTokensOut).toBe(300);
    });
  });

  describe('getTenantMetrics', () => {
    it('returns null for unknown tenant', () => {
      expect(getTenantMetrics('UNKNOWN')).toBeNull();
    });

    it('computes p50 latency', () => {
      // Record 5 requests at 100, 200, 300, 400, 500ms
      for (const latencyMs of [100, 200, 300, 400, 500]) {
        makeRecord('T1', { latencyMs });
      }
      const m = getTenantMetrics('T1')!;
      // p50 of [100,200,300,400,500] = 300
      expect(m.p50LatencyMs).toBe(300);
    });

    it('computes p95 latency', () => {
      // 5 at 100ms + 1 at 5000ms = 6 total
      // p95 of 6 = ceil(0.95*6)=6, idx=5 → 5000ms
      for (let i = 0; i < 5; i++) {
        makeRecord('T1', { latencyMs: 100 });
      }
      makeRecord('T1', { latencyMs: 5000 });
      const m = getTenantMetrics('T1')!;
      expect(m.p95LatencyMs).toBe(5000);
    });

    it('computes errorRate', () => {
      makeRecord('T1', { hadError: false });
      makeRecord('T1', { hadError: false });
      makeRecord('T1', { hadError: true });
      const m = getTenantMetrics('T1')!;
      expect(m.errorRate).toBeCloseTo(1 / 3);
    });
  });

  describe('getGlobalMetrics', () => {
    it('aggregates across tenants', () => {
      makeRecord('T1');
      makeRecord('T2');
      makeRecord('T2');
      const g = getGlobalMetrics();
      expect(g.totalRequests).toBe(3);
      expect(g.uniqueTenants).toBe(2);
    });

    it('includes topTenants sorted by request count', () => {
      for (let i = 0; i < 5; i++) makeRecord('T_BUSY');
      for (let i = 0; i < 2; i++) makeRecord('T_LIGHT');
      const g = getGlobalMetrics(10);
      expect(g.topTenants[0]!.tenantId).toBe('T_BUSY');
      expect(g.topTenants[0]!.totalRequests).toBe(5);
      expect(g.topTenants[1]!.tenantId).toBe('T_LIGHT');
    });

    it('respects topN parameter', () => {
      for (let i = 0; i < 5; i++) makeRecord(`T${i}`);
      const g = getGlobalMetrics(3);
      expect(g.topTenants).toHaveLength(3);
    });

    it('computes global cacheHitRate', () => {
      makeRecord('T1', { cacheStatus: 'HIT' });
      makeRecord('T1', { cacheStatus: 'MISS' });
      const g = getGlobalMetrics();
      expect(g.cacheHitRate).toBeCloseTo(0.5);
    });

    it('returns zero values when no data', () => {
      const g = getGlobalMetrics();
      expect(g.totalRequests).toBe(0);
      expect(g.uniqueTenants).toBe(0);
      expect(g.cacheHitRate).toBe(0);
    });
  });
});
