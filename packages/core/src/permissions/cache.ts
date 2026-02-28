export interface PermissionCache {
  get(key: string): Promise<Set<string> | null>;
  /** Returns stale (expired but not evicted) entry as fallback when DB is unreachable */
  getStale(key: string): Promise<Set<string> | null>;
  set(key: string, permissions: Set<string>, ttlSeconds: number): Promise<void>;
  delete(pattern: string): Promise<void>;
}

// Sized for Vercel Pro fleet: 5K entries × ~350 bytes = ~1.75MB per instance.
// Key is tenantId:userId:locationId — at 2K users × 3 locations = 6K unique keys.
// 5K slots give ~83% hit rate; 15s TTL ensures fast permission revocation.
const PERMISSION_CACHE_MAX_SIZE = 5_000;

// Stale entries kept for up to 5 minutes as fallback when DB is unreachable.
// Prevents pool-exhaustion cascades from taking down the entire app.
const STALE_WINDOW_MS = 5 * 60 * 1000;

export class InMemoryPermissionCache implements PermissionCache {
  private store = new Map<string, { permissions: Set<string>; expiresAt: number }>();

  async get(key: string): Promise<Set<string> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Don't delete — keep for getStale() fallback
      return null;
    }
    // LRU touch: move to end of insertion order
    this.store.delete(key);
    this.store.set(key, entry);
    return new Set(entry.permissions);
  }

  async getStale(key: string): Promise<Set<string> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    // Allow stale data up to STALE_WINDOW_MS past expiry
    const staleDeadline = entry.expiresAt + STALE_WINDOW_MS;
    if (Date.now() > staleDeadline) {
      this.store.delete(key);
      return null;
    }
    return new Set(entry.permissions);
  }

  async set(key: string, permissions: Set<string>, ttlSeconds: number): Promise<void> {
    // LRU: delete-before-set ensures key moves to end
    this.store.delete(key);
    this.store.set(key, {
      permissions: new Set(permissions),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    // Evict oldest entries when over capacity
    if (this.store.size > PERMISSION_CACHE_MAX_SIZE) {
      const keysIter = this.store.keys();
      const toEvict = this.store.size - PERMISSION_CACHE_MAX_SIZE;
      for (let i = 0; i < toEvict; i++) {
        const { value, done } = keysIter.next();
        if (done) break;
        this.store.delete(value);
      }
    }
  }

  async delete(pattern: string): Promise<void> {
    // pattern is like "perms:tenantId:userId:*"
    const prefix = pattern.replace(/\*$/, '');
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
}

export class RedisPermissionCache implements PermissionCache {
  private redis: RedisLike;

  constructor(redis: RedisLike) {
    this.redis = redis;
  }

  async get(key: string): Promise<Set<string> | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    return new Set(JSON.parse(data) as string[]);
  }

  async getStale(key: string): Promise<Set<string> | null> {
    // Redis handles TTL natively — once expired, data is gone.
    // No stale fallback available with Redis (it evicts on expiry).
    return this.get(key);
  }

  async set(key: string, permissions: Set<string>, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify([...permissions]), 'EX', ttlSeconds);
  }

  async delete(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}

let cacheInstance: PermissionCache | null = null;

export function getPermissionCache(): PermissionCache {
  if (!cacheInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        // Dynamic import to avoid requiring ioredis when not using Redis
        const pkg = 'io' + 'redis';
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Redis = require(pkg);
        const redis = new Redis(redisUrl);
        cacheInstance = new RedisPermissionCache(redis);
      } catch {
        cacheInstance = new InMemoryPermissionCache();
      }
    } else {
      cacheInstance = new InMemoryPermissionCache();
    }
  }
  return cacheInstance;
}

export function setPermissionCache(cache: PermissionCache): void {
  cacheInstance = cache;
}
