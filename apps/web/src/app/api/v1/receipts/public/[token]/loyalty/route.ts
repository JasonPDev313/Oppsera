import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceiptByToken, recordLoyaltySignup } from '@oppsera/core/settings/receipt-links';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security/rate-limiter';

// POST /api/v1/receipts/public/:token/loyalty — loyalty signup capture (no auth)
export const POST = withMiddleware(
  async (request: NextRequest) => {
    // Rate limit: 10 req/min per IP (request-level)
    const rlKey = getRateLimitKey(request, 'receipt-loyalty');
    const rlResult = checkRateLimit(rlKey, { maxRequests: 10, windowMs: 60_000 });
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
        { status: 429, headers: rateLimitHeaders(rlResult) },
      );
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/receipts/public/:token/loyalty → token is at segments[-2]
    const token = segments[segments.length - 2]!;

    const body = await request.json();

    // Honeypot: silently accept + discard if bot field is populated
    if (body.website) {
      return NextResponse.json({ data: { success: true } });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 },
      );
    }

    const email = typeof body.email === 'string' ? body.email.trim() || undefined : undefined;
    const phone = typeof body.phone === 'string' ? body.phone.trim() || undefined : undefined;

    if (!email && !phone) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Email or phone is required' } },
        { status: 400 },
      );
    }

    const link = await getReceiptByToken(token);
    if (!link) {
      const delay = 50 + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Receipt not found or expired' } },
        { status: 404 },
      );
    }

    // Per-token rate limit: 5 signups total
    const recorded = await recordLoyaltySignup(link.tenantId, link.id, {
      name,
      email,
      phone,
      optedInMarketing: body.optedInMarketing === true,
    });
    if (!recorded) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Signup limit reached for this receipt' } },
        { status: 429 },
      );
    }

    return NextResponse.json({ data: { success: true } }, { status: 201 });
  },
  { public: true },
);
