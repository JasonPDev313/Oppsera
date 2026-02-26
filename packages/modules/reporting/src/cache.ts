import { createHash } from 'node:crypto';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export class TileCache {
  private store = new Map<string, CacheEntry>();

  get(key: string): unknown | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export function buildTileCacheKey(
  tenantId: string,
  reportId: string,
  overrides?: unknown,
): string {
  const overridesHash = overrides
    ? createHash('md5').update(JSON.stringify(overrides)).digest('hex').slice(0, 8)
    : 'none';
  return `tile:${tenantId}:${reportId}:${overridesHash}`;
}

let instance: TileCache | null = null;

export function getTileCache(): TileCache {
  if (!instance) {
    instance = new TileCache();
  }
  return instance;
}

export function setTileCache(cache: TileCache): void {
  instance = cache;
}
