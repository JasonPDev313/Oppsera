import { createPublicKey, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
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
const authUserCache = new Map<string, { user: AuthUser; ts: number }>();

function getCachedAuthUser(authProviderId: string): AuthUser | null {
  const entry = authUserCache.get(authProviderId);
  if (!entry) return null;
  if (Date.now() - entry.ts > AUTH_CACHE_TTL) {
    authUserCache.delete(authProviderId);
    return null;
  }
  // LRU touch: move to end of insertion order so frequently-used entries survive eviction
  authUserCache.delete(authProviderId);
  authUserCache.set(authProviderId, entry);
  return entry.user;
}

function setCachedAuthUser(authProviderId: string, user: AuthUser) {
  // Delete-before-set ensures this key moves to end of insertion order (LRU)
  authUserCache.delete(authProviderId);
  authUserCache.set(authProviderId, { user, ts: Date.now() });
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

      // Check cache first — avoids 3 sequential DB queries on hot POS paths
      const cached = getCachedAuthUser(authProviderId);
      if (cached) return cached;

      // Look up user by auth_provider_id
      const user = await db.query.users.findFirst({
        where: eq(users.authProviderId, authProviderId),
      });
      if (!user) return null;

      // Look up active membership + tenant in one query (saves 1 DB round-trip on cold start)
      const membershipRows = await db
        .select({
          membershipStatus: memberships.status,
          tenantId: memberships.tenantId,
          tenantStatus: tenants.status,
        })
        .from(memberships)
        .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
        .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')))
        .orderBy(asc(memberships.createdAt))
        .limit(1);

      const membershipRow = membershipRows[0];

      if (!membershipRow) {
        // User exists but has no tenant — needs onboarding
        const result: AuthUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: '',
          tenantStatus: 'none',
          membershipStatus: 'none',
        };
        setCachedAuthUser(authProviderId, result);
        return result;
      }

      const result: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: membershipRow.tenantId,
        tenantStatus: membershipRow.tenantStatus,
        membershipStatus: membershipRow.membershipStatus,
      };
      setCachedAuthUser(authProviderId, result);
      return result;
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
