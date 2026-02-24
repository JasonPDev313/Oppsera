import jwt from 'jsonwebtoken';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { users, memberships, tenants } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import type { AuthAdapter, AuthUser } from './index';

const DEV_SECRET = 'oppsera-dev-secret-do-not-use-in-production';

/**
 * Dev-only auth adapter that bypasses Supabase entirely.
 * Activated by setting DEV_AUTH_BYPASS=true in .env.local.
 *
 * - signIn: looks up user by email in the DB, returns a self-signed JWT.
 * - validateToken: verifies the self-signed JWT and resolves the user.
 * - signUp: creates a DB user directly (no Supabase account).
 */
export class DevAuthAdapter implements AuthAdapter {
  async validateToken(token: string): Promise<AuthUser | null> {
    try {
      const decoded = jwt.verify(token, DEV_SECRET, { algorithms: ['HS256'] }) as {
        sub: string;
      };

      const userId = decoded.sub;
      if (!userId) return null;

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user) return null;

      const membership = await db.query.memberships.findFirst({
        where: and(eq(memberships.userId, user.id), eq(memberships.status, 'active')),
        orderBy: [asc(memberships.createdAt)],
      });

      if (!membership) {
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: '',
          tenantStatus: 'none',
          membershipStatus: 'none',
        };
      }

      // Select only needed columns to avoid schema mismatch
      // when new columns exist in Drizzle but migration hasn't run yet
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, membership.tenantId),
        columns: { id: true, status: true },
      });
      if (!tenant) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: membership.tenantId,
        tenantStatus: tenant.status,
        membershipStatus: membership.status,
      };
    } catch (error) {
      // JWT errors → return null (auth failure)
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        return null;
      }
      // DB errors → re-throw so middleware returns 500, not 401
      throw error;
    }
  }

  async signIn(
    email: string,
    _password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!user) {
      // Constant-time delay to prevent user enumeration via timing attack.
      // Without this, "user not found" returns faster than "user found" (no
      // password hash check), leaking whether an email is registered.
      await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 40));
      throw new AppError('AUTH_SIGNIN_FAILED', 'Invalid email or password', 401);
    }

    const accessToken = jwt.sign({ sub: user.id }, DEV_SECRET, {
      algorithm: 'HS256',
      expiresIn: '24h',
    });

    const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, DEV_SECRET, {
      algorithm: 'HS256',
      expiresIn: '7d',
    });

    console.log(`[DEV AUTH] Signed in as ${user.email} (${user.id})`);

    return { accessToken, refreshToken };
  }

  async signUp(
    email: string,
    _password: string,
    name: string,
  ): Promise<{ userId: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();

    const userId = generateUlid();
    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: trimmedName,
      authProviderId: `dev-${userId}`,
      isPlatformAdmin: false,
    });

    console.log(`[DEV AUTH] Created user ${normalizedEmail} (${userId})`);

    return { userId };
  }

  async signOut(_token: string): Promise<void> {
    // No-op in dev mode
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const decoded = jwt.verify(refreshToken, DEV_SECRET, { algorithms: ['HS256'] }) as {
      sub: string;
    };

    const newAccessToken = jwt.sign({ sub: decoded.sub }, DEV_SECRET, {
      algorithm: 'HS256',
      expiresIn: '24h',
    });

    const newRefreshToken = jwt.sign({ sub: decoded.sub, type: 'refresh' }, DEV_SECRET, {
      algorithm: 'HS256',
      expiresIn: '7d',
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async sendMagicLink(_email: string): Promise<void> {
    console.log('[DEV AUTH] Magic link not supported in dev mode — use email/password login');
  }
}
