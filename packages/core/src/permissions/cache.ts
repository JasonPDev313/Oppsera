export interface PermissionCache {
  get(key: string): Promise<Set<string> | null>;
  set(key: string, permissions: Set<string>, ttlSeconds: number): Promise<void>;
  delete(pattern: string): Promise<void>;
}

export class InMemoryPermissionCache implements PermissionCache {
  private store = new Map<string, { permissions: Set<string>; expiresAt: number }>();

  async get(key: string): Promise<Set<string> | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return new Set(entry.permissions);
  }

  async set(key: string, permissions: Set<string>, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      permissions: new Set(permissions),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Redis = require('ioredis');
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
