import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import {
  RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders,
  checkAccountLockout, recordLoginFailure, recordLoginSuccess,
} from '@oppsera/core/security';
import { AppError, ValidationError } from '@oppsera/shared';
import { auditLogSystem } from '@oppsera/core/audit/helpers';
import { resolveGeo, recordLoginEvent } from '@oppsera/core/security';
import { createAdminClient, users, memberships } from '@oppsera/db';

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

/** Resolve userId + tenantId from email. Best-effort, never throws. */
async function resolveUserIdentity(email: string) {
  try {
    const adminDb = createAdminClient();
    const [row] = await adminDb
      .select({ userId: users.id, tenantId: memberships.tenantId })
      .from(users)
      .leftJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.status, 'active')))
      .where(eq(users.email, email))
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Record login event with geo data. Awaited before response to prevent
 * Vercel event loop freeze from creating zombie DB connections.
 * Non-fatal — never blocks login response on recording failure.
 */
async function safeRecordLoginEvent(
  headers: Headers,
  ip: string | undefined,
  identity: { userId: string; tenantId: string | null } | null,
  email: string,
  outcome: 'success' | 'failed' | 'locked',
  userAgent: string | undefined,
  failureReason?: string,
): Promise<void> {
  try {
    const geo = await resolveGeo(headers, ip);
    await recordLoginEvent({
      tenantId: identity?.tenantId ?? '',
      userId: identity?.userId ?? null,
      email, outcome, ipAddress: ip, userAgent, geo,
      failureReason,
    });
  } catch {
    // Non-fatal — never block login on recording failure
  }
}

export const POST = withMiddleware(
  async (request) => {
    const rlKey = getRateLimitKey(request, 'auth:login');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.auth);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { email, password } = parsed.data;
    const adapter = getAuthAdapter();
    const ip = request.headers.get('x-forwarded-for') ?? undefined;

    const userAgent = request.headers.get('user-agent') ?? undefined;

    // Account-level lockout check (5 failures → 15-min lock)
    const lockout = checkAccountLockout(email);
    if (lockout.locked) {
      // Await login event recording BEFORE returning — Vercel freezes event loop after response
      const identity = await resolveUserIdentity(email);
      await safeRecordLoginEvent(request.headers, ip, identity, email, 'locked', userAgent, 'Account temporarily locked');

      return NextResponse.json(
        { error: { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Please try again later.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(lockout.retryAfterMs / 1000)) } },
      );
    }

    try {
      const result = await adapter.signIn(email, password);

      // Clear lockout counter on success
      recordLoginSuccess(email);

      // Resolve identity once — reuse for audit, lastLoginAt, and login recording
      let identity: { userId: string; tenantId: string | null } | null = null;
      try {
        identity = await resolveUserIdentity(email);
        if (identity) {
          const adminDb = createAdminClient();
          await adminDb
            .update(users)
            .set({ lastLoginAt: new Date(), updatedAt: new Date() })
            .where(eq(users.id, identity.userId));
          await auditLogSystem(identity.tenantId ?? '', 'auth.login.success', 'user', identity.userId, { email, ip });
        } else {
          await auditLogSystem('', 'auth.login.success', 'user', 'unknown', { email, ip });
        }
      } catch (err) { console.error('[audit]:', err); }

      // Await login event recording BEFORE returning — Vercel freezes event loop after response
      await safeRecordLoginEvent(request.headers, ip, identity, email, 'success', userAgent);

      return NextResponse.json({ data: result });
    } catch (error) {
      // Record failure for lockout tracking
      recordLoginFailure(email);

      // Audit failed login with resolved identity
      let failIdentity: { userId: string; tenantId: string | null } | null = null;
      try {
        failIdentity = await resolveUserIdentity(email);
        await auditLogSystem(
          failIdentity?.tenantId ?? '',
          'auth.login.failed',
          'user',
          failIdentity?.userId ?? 'unknown',
          { email, ip },
        );
      } catch (err) { console.error('[audit]:', err); }

      // Await login event recording BEFORE throwing — Vercel freezes event loop after response
      await safeRecordLoginEvent(request.headers, ip, failIdentity, email, 'failed', userAgent, 'Invalid credentials');

      if (error instanceof AppError) throw error;
      throw new AppError('AUTH_SIGNIN_FAILED', 'Invalid credentials', 401);
    }
  },
  { public: true },
);
