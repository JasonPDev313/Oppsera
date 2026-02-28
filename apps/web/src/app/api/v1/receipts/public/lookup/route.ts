import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReceiptsByLookupCode } from '@oppsera/core/settings/receipt-links';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security/rate-limiter';
import type { ReceiptPublicLink } from '@oppsera/core/settings/receipt-links';
import type {
  ReceiptBlock,
  OrderInfoBlock,
  TotalsBlock,
  PaymentBlock,
} from '@oppsera/shared';

// POST /api/v1/receipts/public/lookup — proof-of-possession receipt lookup (no auth)
export const POST = withMiddleware(
  async (request: NextRequest) => {
    // Rate limit: 10 req/min per IP
    const rlKey = getRateLimitKey(request, 'receipt-lookup');
    const rlResult = checkRateLimit(rlKey, { maxRequests: 10, windowMs: 60_000 });
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
        { status: 429, headers: rateLimitHeaders(rlResult) },
      );
    }

    const body = await request.json();

    const lookupCode = typeof body.lookupCode === 'string' ? body.lookupCode.trim() : '';
    if (!lookupCode || lookupCode.length < 4) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Lookup code is required' } },
        { status: 400 },
      );
    }

    // Proof of possession: receipt number required, plus total or card last 4
    const receiptNumber = typeof body.receiptNumber === 'string' ? body.receiptNumber.trim() : '';
    const totalCents = typeof body.totalCents === 'number' ? body.totalCents : null;
    const cardLast4 = typeof body.cardLast4 === 'string' ? body.cardLast4.trim() : '';

    if (!receiptNumber) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Receipt number is required' } },
        { status: 400 },
      );
    }

    if (totalCents === null && !cardLast4) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Total amount or card last 4 digits required' } },
        { status: 400 },
      );
    }

    const links = await getReceiptsByLookupCode(lookupCode);
    if (links.length === 0) {
      // Anti-enumeration: random delay before 404
      const delay = 50 + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    // Check proof of possession against each matching link
    const matched = links.find((link) => verifyProofOfPossession(link, receiptNumber, totalCents, cardLast4));

    if (!matched) {
      const delay = 50 + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: { token: matched.token },
    });
  },
  { public: true },
);

// ── Proof of Possession Helpers ──────────────────────────────────

function verifyProofOfPossession(
  link: ReceiptPublicLink,
  receiptNumber: string,
  totalCents: number | null,
  cardLast4: string,
): boolean {
  const doc = link.receiptDocumentSnapshot;
  if (!doc || !Array.isArray(doc.blocks)) return false;

  // Find order info block for receipt number
  const orderInfo = doc.blocks.find(
    (b: ReceiptBlock) => b.type === 'order_info',
  ) as OrderInfoBlock | undefined;
  if (!orderInfo) return false;

  // Receipt number must match
  if (orderInfo.orderNumber !== receiptNumber) return false;

  // Check total or card last 4
  if (totalCents !== null) {
    const totals = doc.blocks.find(
      (b: ReceiptBlock) => b.type === 'totals',
    ) as TotalsBlock | undefined;
    if (totals && totals.totalCents === totalCents) return true;
  }

  if (cardLast4) {
    const payment = doc.blocks.find(
      (b: ReceiptBlock) => b.type === 'payment',
    ) as PaymentBlock | undefined;
    if (payment) {
      const hasCard = payment.tenders.some((t) => t.cardLast4 === cardLast4);
      if (hasCard) return true;
    }
  }

  return false;
}
