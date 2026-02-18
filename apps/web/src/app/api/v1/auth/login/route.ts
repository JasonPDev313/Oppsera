import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { AppError, ValidationError } from '@oppsera/shared';
import { auditLogSystem } from '@oppsera/core/audit/helpers';

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

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

    try {
      const result = await adapter.signIn(email, password);
      try {
        await auditLogSystem('', 'auth.login.success', 'user', 'unknown', { email });
      } catch { /* best-effort */ }
      return NextResponse.json({ data: result });
    } catch (error) {
      try {
        await auditLogSystem('', 'auth.login.failed', 'user', 'unknown', { email });
      } catch { /* best-effort */ }
      if (error instanceof AppError) throw error;
      throw new AppError('AUTH_SIGNIN_FAILED', 'Invalid credentials', 401);
    }
  },
  { public: true },
);
