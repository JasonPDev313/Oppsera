import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TileCache, buildTileCacheKey } from '../cache';

// ═══════════════════════════════════════════════════════════════
// TileCache
// ═══════════════════════════════════════════════════════════════

describe('TileCache', () => {
  let cache: TileCache;

  beforeEach(() => {
    cache = new TileCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('stores and retrieves data within TTL', () => {
    cache.set('key1', { value: 42 }, 60_000);
    expect(cache.get('key1')).toEqual({ value: 42 });
  });

  it('returns null for expired entry', () => {
    cache.set('key1', { value: 42 }, 60_000);
    vi.advanceTimersByTime(61_000);
    expect(cache.get('key1')).toBeNull();
  });

  it('overwrites existing entry', () => {
    cache.set('key1', { value: 1 }, 60_000);
    cache.set('key1', { value: 2 }, 60_000);
    expect(cache.get('key1')).toEqual({ value: 2 });
  });

  it('deletes a specific entry', () => {
    cache.set('key1', { value: 1 }, 60_000);
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('clears all entries', () => {
    cache.set('key1', { value: 1 }, 60_000);
    cache.set('key2', { value: 2 }, 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('tracks size correctly', () => {
    expect(cache.size).toBe(0);
    cache.set('key1', 'a', 60_000);
    expect(cache.size).toBe(1);
    cache.set('key2', 'b', 60_000);
    expect(cache.size).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// buildTileCacheKey
// ═══════════════════════════════════════════════════════════════

describe('buildTileCacheKey', () => {
  it('includes tenantId and reportId', () => {
    const key = buildTileCacheKey('tenant_1', 'rpt_1');
    expect(key).toContain('tenant_1');
    expect(key).toContain('rpt_1');
    expect(key).toContain('tile:');
    expect(key).toContain(':none');
  });

  it('includes override hash when overrides provided', () => {
    const key1 = buildTileCacheKey('tenant_1', 'rpt_1', { filters: [{ op: 'gte' }] });
    const key2 = buildTileCacheKey('tenant_1', 'rpt_1');
    expect(key1).not.toBe(key2);
    expect(key1).not.toContain(':none');
  });

  it('different tenants produce different keys', () => {
    const key1 = buildTileCacheKey('tenant_1', 'rpt_1');
    const key2 = buildTileCacheKey('tenant_2', 'rpt_1');
    expect(key1).not.toBe(key2);
  });

  it('different reports produce different keys', () => {
    const key1 = buildTileCacheKey('tenant_1', 'rpt_1');
    const key2 = buildTileCacheKey('tenant_1', 'rpt_2');
    expect(key1).not.toBe(key2);
  });

  it('same overrides produce same hash', () => {
    const overrides = { filters: [{ fieldKey: 'date', op: 'gte', value: '2026-01-01' }] };
    const key1 = buildTileCacheKey('tenant_1', 'rpt_1', overrides);
    const key2 = buildTileCacheKey('tenant_1', 'rpt_1', overrides);
    expect(key1).toBe(key2);
  });
});
