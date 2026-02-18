import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { ValidationError } from '@oppsera/shared';

const magicLinkSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
});

export const POST = withMiddleware(
  async (request) => {
    const rlKey = getRateLimitKey(request, 'auth:magic-link');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.authStrict);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const parsed = magicLinkSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const adapter = getAuthAdapter();

    try {
      await adapter.sendMagicLink(parsed.data.email);
    } catch {
      // Swallow errors to prevent email enumeration
    }

    return NextResponse.json({
      data: { message: 'If an account exists, a magic link has been sent.' },
    });
  },
  { public: true },
);
