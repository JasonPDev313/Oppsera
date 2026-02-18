import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { AppError, ValidationError } from '@oppsera/shared';

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const POST = withMiddleware(
  async (request) => {
    const rlKey = getRateLimitKey(request, 'auth:refresh');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.auth);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const adapter = getAuthAdapter();

    try {
      const result = await adapter.refreshToken(parsed.data.refreshToken);
      return NextResponse.json({ data: result });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AUTH_REFRESH_FAILED', 'Failed to refresh token', 401);
    }
  },
  { public: true },
);
