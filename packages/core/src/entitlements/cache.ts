import type { AccessMode } from './registry';

export interface EntitlementCacheEntry {
  isEnabled: boolean;
  accessMode: AccessMode;
  expiresAt: string | null;
  limits: Record<string, number>;
}

export interface EntitlementCache {
  get(key: string): Promise<Map<string, EntitlementCacheEntry> | null>;
  /** Returns stale (expired but not evicted) entry as fallback when DB is unreachable */
  getStale(key: string): Promise<Map<string, EntitlementCacheEntry> | null>;
  set(key: string, entries: Map<string, EntitlementCacheEntry>, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// Keyed by tenantId — 2K entries handles up to 2K concurrent tenants per instance.
// Each entry is ~500 bytes (Map of 5-20 module entitlements).
const ENTITLEMENT_CACHE_MAX_SIZE = 2_000;

// Stale entries kept for up to 5 minutes as fallback when DB is unreachable.
// Prevents pool-exhaustion cascades from taking down the entire app.
const STALE_WINDOW_MS = 5 * 60 * 1000;

export class InMemoryEntitlementCache implements EntitlementCache {
  private store = new Map<string, { entries: Map<string, EntitlementCacheEntry>; expiresAt: number }>();

  async get(key: string): Promise<Map<string, EntitlementCacheEntry> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Don't delete — keep for getStale() fallback
      return null;
    }
    // LRU touch: move to end of insertion order
    this.store.delete(key);
    this.store.set(key, entry);
    return new Map(entry.entries);
  }

  async getStale(key: string): Promise<Map<string, EntitlementCacheEntry> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    // Allow stale data up to STALE_WINDOW_MS past expiry
    const staleDeadline = entry.expiresAt + STALE_WINDOW_MS;
    if (Date.now() > staleDeadline) {
      this.store.delete(key);
      return null;
    }
    return new Map(entry.entries);
  }

  async set(key: string, entries: Map<string, EntitlementCacheEntry>, ttlSeconds: number): Promise<void> {
    // LRU: delete-before-set ensures key moves to end
    this.store.delete(key);
    this.store.set(key, {
      entries: new Map(entries),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    // Evict oldest entries when over capacity
    if (this.store.size > ENTITLEMENT_CACHE_MAX_SIZE) {
      const keysIter = this.store.keys();
      const toEvict = this.store.size - ENTITLEMENT_CACHE_MAX_SIZE;
      for (let i = 0; i < toEvict; i++) {
        const { value, done } = keysIter.next();
        if (done) break;
        this.store.delete(value);
      }
    }
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
