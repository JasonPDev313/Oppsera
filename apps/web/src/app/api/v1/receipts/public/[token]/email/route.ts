import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceiptByToken, recordReceiptEmail } from '@oppsera/core/settings/receipt-links';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security/rate-limiter';

// POST /api/v1/receipts/public/:token/email — email receipt to guest (no auth)
export const POST = withMiddleware(
  async (request: NextRequest) => {
    // Rate limit: 10 req/min per IP (request-level)
    const rlKey = getRateLimitKey(request, 'receipt-email');
    const rlResult = checkRateLimit(rlKey, { maxRequests: 10, windowMs: 60_000 });
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
        { status: 429, headers: rateLimitHeaders(rlResult) },
      );
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/receipts/public/:token/email → token is at segments[-2]
    const token = segments[segments.length - 2]!;

    const body = await request.json();

    // Honeypot: silently accept + discard if bot field is populated
    if (body.website) {
      return NextResponse.json({ data: { sent: true } });
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' } },
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

    // Per-token rate limit: 3 emails per hour
    const recorded = await recordReceiptEmail(link.tenantId, link.id, email);
    if (!recorded) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Email limit reached for this receipt' } },
        { status: 429 },
      );
    }

    // V1: email sending is a stub — log and return success
    // Future: integrate with SendGrid/Resend/SES to deliver receipt HTML
    console.log(`[receipt-email] Queued receipt email for link=${link.id} to=${email}`);

    return NextResponse.json({ data: { sent: true } });
  },
  { public: true },
);
