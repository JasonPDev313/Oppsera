import { createPublicKey, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { eq, and, asc } from 'drizzle-orm';
import { db, jitterTtlMs, isBreakerOpen, guardedQuery } from '@oppsera/db';
import { users, memberships, tenants } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import { createSupabaseAdmin } from './supabase-client';
import type { AuthAdapter, AuthUser } from './index';

let _publicKey: KeyObject | null = null;

function getVerificationKey(): { key: string | KeyObject; algorithms: jwt.Algorithm[] } {
  // Prefer ES256 with JWK public key (new Supabase projects)
  const jwkStr = process.env.SUPABASE_JWT_JWK;
  if (jwkStr) {
    if (!_publicKey) {
      const jwk = JSON.parse(jwkStr);
      _publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    }
    return { key: _publicKey, algorithms: ['ES256'] };
  }

  // Fall back to HS256 with symmetric secret (legacy Supabase projects)
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    return { key: secret, algorithms: ['HS256'] };
  }

  throw new Error('SUPABASE_JWT_JWK or SUPABASE_JWT_SECRET must be set');
}

// In-memory auth user cache (120s TTL, 2K entries). Eliminates 3 DB queries per request on hot paths.
// Sized for Vercel Pro fleet: 2K entries × ~250 bytes = ~500KB per instance. With 100 instances
// that's 50MB aggregate — well within Vercel Pro's 3GB memory limit per function.
const AUTH_CACHE_TTL = 120_000;
const AUTH_CACHE_MAX_SIZE = 2_000;
// Stale entries kept for 5 minutes as fallback when DB is unreachable.
const AUTH_STALE_WINDOW_MS = 5 * 60 * 1000;
const authUserCache = new Map<string, { user: AuthUser; ts: number; ttl: number }>();

function getCachedAuthUser(authProviderId: string): AuthUser | null {
  const entry = authUserCache.get(authProviderId);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    // Don't delete — keep for stale fallback
    return null;
  }
  // LRU touch: move to end of insertion order so frequently-used entries survive eviction
  authUserCache.delete(authProviderId);
  authUserCache.set(authProviderId, entry);
  return entry.user;
}

function getStaleCachedAuthUser(authProviderId: string): AuthUser | null {
  const entry = authUserCache.get(authProviderId);
  if (!entry) return null;
  const staleDeadline = entry.ts + entry.ttl + AUTH_STALE_WINDOW_MS;
  if (Date.now() > staleDeadline) {
    authUserCache.delete(authProviderId);
    return null;
  }
  return entry.user;
}

function setCachedAuthUser(authProviderId: string, user: AuthUser) {
  // Delete-before-set ensures this key moves to end of insertion order (LRU)
  authUserCache.delete(authProviderId);
  // Jitter the TTL ±15% to prevent synchronized cache expirations (thundering herd)
  authUserCache.set(authProviderId, { user, ts: Date.now(), ttl: jitterTtlMs(AUTH_CACHE_TTL) });
  // Evict oldest entries when over capacity (batch evict to avoid per-insert overhead)
  if (authUserCache.size > AUTH_CACHE_MAX_SIZE) {
    const keysIter = authUserCache.keys();
    const toEvict = authUserCache.size - AUTH_CACHE_MAX_SIZE;
    for (let i = 0; i < toEvict; i++) {
      const { value, done } = keysIter.next();
      if (done) break;
      authUserCache.delete(value);
    }
  }
}

// In-flight deduplication: when N concurrent requests arrive for the same uncached user,
// only the first executes the DB queries — the others await the same Promise.
// This prevents cache stampedes when multiple users from the same tenant are active
// and Vercel cold-starts a new instance (empty cache, burst of requests).
const _inFlightValidations = new Map<string, Promise<AuthUser | null>>();

export class SupabaseAuthAdapter implements AuthAdapter {
  private _supabase: ReturnType<typeof createSupabaseAdmin> | null = null;

  private get supabase() {
    if (!this._supabase) {
      this._supabase = createSupabaseAdmin();
    }
    return this._supabase;
  }

  async validateToken(token: string): Promise<AuthUser | null> {
    try {
      const { key, algorithms } = getVerificationKey();

      const decoded = jwt.verify(token, key, { algorithms }) as { sub: string };

      const authProviderId = decoded.sub;
      if (!authProviderId) return null;

      // Check cache first — avoids 2 DB queries on hot POS paths
      const cached = getCachedAuthUser(authProviderId);
      if (cached) return cached;

      // Circuit breaker open — fall back to stale cache if available
      if (isBreakerOpen()) {
        const stale = getStaleCachedAuthUser(authProviderId);
        if (stale) {
          console.warn(`[auth] Circuit breaker open, using stale cache for ${authProviderId}`);
          return stale;
        }
      }

      // Deduplicate concurrent DB lookups for the same user.
      // When 10 requests arrive simultaneously with a cold cache, only
      // the first executes the queries — the other 9 await the same Promise.
      const inFlight = _inFlightValidations.get(authProviderId);
      if (inFlight) return inFlight;

      const lookupPromise = this._lookupAuthUser(authProviderId);
      _inFlightValidations.set(authProviderId, lookupPromise);

      try {
        return await lookupPromise;
      } finally {
        _inFlightValidations.delete(authProviderId);
      }
    } catch (error) {
      // JWT errors are auth failures → return null → 401
      if (error instanceof jwt.JsonWebTokenError) {
        console.debug('JWT validation failed:', error.message);
        return null;
      }
      if (error instanceof jwt.TokenExpiredError) {
        console.debug('JWT expired');
        return null;
      }
      // Everything else (DB timeout, connection error, pool exhaustion) is a
      // server error — re-throw so middleware returns 500 instead of 401.
      // This prevents login from clearing tokens on transient failures.
      console.error('Token validation server error:', error);
      throw error;
    }
  }

  /** Extracted DB lookup — called once per authProviderId, shared across concurrent requests.
   *  Wrapped in a 5s timeout to prevent pool exhaustion from stuck queries. */
  private async _lookupAuthUser(authProviderId: string): Promise<AuthUser | null> {
    // 5s timeout prevents a stuck query from holding a pool connection indefinitely.
    // With max:2 pool, one stuck query = 50% pool exhaustion = cascading failures.
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Auth DB lookup timed out after 5000ms')), 5000);
    });

    try {
      return await Promise.race([this._doLookup(authProviderId), timeout]);
    } catch (err) {
      // On timeout or DB error, try stale cache as fallback
      const stale = getStaleCachedAuthUser(authProviderId);
      if (stale) {
        console.warn(`[auth] DB lookup failed, using stale cache for ${authProviderId}: ${(err as Error).message}`);
        return stale;
      }
      // No stale data available — re-throw
      throw err;
    } finally {
      clearTimeout(timer!);
    }
  }

  private async _doLookup(authProviderId: string): Promise<AuthUser | null> {
    // Single query: user LEFT JOIN membership LEFT JOIN tenant.
    // Combines what was 2 sequential queries into 1 — critical with max:2 pool on Vercel.
    // LEFT JOIN handles users without a membership (needs onboarding).
    // Wrapped in guardedQuery for semaphore + circuit breaker + slow query logging.
    const rows = await guardedQuery('auth:validateToken', () =>
      db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          tenantId: memberships.tenantId,
          membershipStatus: memberships.status,
          tenantStatus: tenants.status,
        })
        .from(users)
        .leftJoin(
          memberships,
          and(eq(memberships.userId, users.id), eq(memberships.status, 'active')),
        )
        .leftJoin(tenants, eq(tenants.id, memberships.tenantId))
        .where(eq(users.authProviderId, authProviderId))
        .orderBy(asc(memberships.createdAt))
        .limit(1),
    );

    const row = rows[0];
    if (!row) return null;

    const result: AuthUser = {
      id: row.userId,
      email: row.email,
      name: row.name,
      tenantId: row.tenantId ?? '',
      tenantStatus: row.tenantStatus ?? 'none',
      membershipStatus: row.membershipStatus ?? 'none',
    };
    setCachedAuthUser(authProviderId, result);
    return result;
  }

  async signUp(
    email: string,
    password: string,
    name: string,
  ): Promise<{ userId: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();

    // Use admin API to create user with auto-confirm — avoids email verification
    // requirement that blocks login on hosted Supabase.
    const { data, error } = await this.supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (error) {
      throw new AppError('AUTH_SIGNUP_FAILED', error.message);
    }

    if (!data.user) {
      throw new AppError('AUTH_SIGNUP_FAILED', 'No user returned from auth provider');
    }

    const userId = generateUlid();
    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: trimmedName,
      authProviderId: data.user.id,
      isPlatformAdmin: false,
    });

    return { userId };
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      throw new AppError('AUTH_SIGNIN_FAILED', error.message, 401);
    }

    if (!data.session) {
      throw new AppError('AUTH_SIGNIN_FAILED', 'No session returned', 401);
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async signOut(token: string): Promise<void> {
    try {
      // Use 'local' scope to revoke ONLY this session's refresh token.
      // The previous code used 'global' scope (the default) which revoked ALL
      // sessions for the user — if Ian logged out from Device A, Device B's
      // session was also destroyed, causing cascading 401s and "everything spins".
      // admin.signOut() takes the JWT (not user ID) + scope.
      if (token) {
        await this.supabase.auth.admin.signOut(token, 'local');
      }
    } catch {
      // Best-effort — swallow errors
    }
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      throw new AppError('AUTH_REFRESH_FAILED', error.message, 401);
    }

    if (!data.session) {
      throw new AppError('AUTH_REFRESH_FAILED', 'No session returned', 401);
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
    });

    if (error) {
      throw new AppError('AUTH_MAGIC_LINK_FAILED', error.message);
    }
  }
}
