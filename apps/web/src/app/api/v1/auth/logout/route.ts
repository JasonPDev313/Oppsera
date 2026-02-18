import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { auditLogSystem } from '@oppsera/core/audit/helpers';

export const POST = withMiddleware(async (request) => {
  const rlKey = getRateLimitKey(request, 'auth:logout');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.auth);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const adapter = getAuthAdapter();
  await adapter.signOut(token);
  try {
    await auditLogSystem('', 'auth.logout', 'user', 'unknown', {});
  } catch { /* best-effort */ }

  return new NextResponse(null, { status: 204 });
});
