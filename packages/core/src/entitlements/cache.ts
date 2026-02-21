import type { AccessMode } from './registry';

export interface EntitlementCacheEntry {
  isEnabled: boolean;
  accessMode: AccessMode;
  expiresAt: string | null;
  limits: Record<string, number>;
}

export interface EntitlementCache {
  get(key: string): Promise<Map<string, EntitlementCacheEntry> | null>;
  set(key: string, entries: Map<string, EntitlementCacheEntry>, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class InMemoryEntitlementCache implements EntitlementCache {
  private store = new Map<string, { entries: Map<string, EntitlementCacheEntry>; expiresAt: number }>();

  async get(key: string): Promise<Map<string, EntitlementCacheEntry> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return new Map(entry.entries);
  }

  async set(key: string, entries: Map<string, EntitlementCacheEntry>, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      entries: new Map(entries),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let cacheInstance: EntitlementCache | null = null;

export function getEntitlementCache(): EntitlementCache {
  if (!cacheInstance) {
    cacheInstance = new InMemoryEntitlementCache();
  }
  return cacheInstance;
}

export function setEntitlementCache(cache: EntitlementCache): void {
  cacheInstance = cache;
}
