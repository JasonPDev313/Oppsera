import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceiptByToken, incrementViewCount } from '@oppsera/core/settings/receipt-links';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security/rate-limiter';

// GET /api/v1/receipts/public/:token — public receipt view (no auth)
export const GET = withMiddleware(
  async (request: NextRequest) => {
    // Rate limit: 30 req/min per IP
    const rlKey = getRateLimitKey(request, 'receipt-view');
    const rlResult = checkRateLimit(rlKey, { maxRequests: 30, windowMs: 60_000 });
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
        { status: 429, headers: rateLimitHeaders(rlResult) },
      );
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 1]!;

    const link = await getReceiptByToken(token);

    if (!link) {
      // Anti-enumeration: random delay before 404
      const delay = 50 + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Receipt not found or expired' } },
        { status: 404 },
      );
    }

    // Fire-and-forget view tracking
    incrementViewCount(link.id).catch(() => {});

    // Redact internal IDs from metadata
    const doc = link.receiptDocumentSnapshot;
    const redactedDoc = {
      ...doc,
      metadata: {
        ...doc.metadata,
        tenantId: undefined,
        locationId: undefined,
      },
    };

    return NextResponse.json({
      data: {
        document: redactedDoc,
        variant: link.variant,
        lookupCode: link.lookupCode,
        viewCount: link.viewCount,
        createdAt: link.createdAt,
      },
    });
  },
  { public: true, botDetection: 'strict' },
);
