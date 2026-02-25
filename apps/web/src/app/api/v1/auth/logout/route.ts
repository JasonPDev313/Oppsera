import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { auditLogSystem } from '@oppsera/core/audit/helpers';

// Logout is public — the token may already be expired or the user may not have
// a tenant (pre-onboarding). We extract the token manually for best-effort
// Supabase signOut but never require authentication.
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
}, { public: true });
