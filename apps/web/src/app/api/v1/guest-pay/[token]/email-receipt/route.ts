import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { sendEmail } from '@oppsera/core/email/send-email';
import { getGuestPaySessionByToken, buildReceiptHtml } from '@oppsera/module-fnb';
import { getOrder } from '@oppsera/module-orders';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/v1/guest-pay/:token/email-receipt — email receipt to guest
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 2]!; // before /email-receipt

    const body = await request.json() as { email?: string };
    const email = body.email?.trim();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'A valid email address is required' } },
        { status: 400 },
      );
    }

    const session = await getGuestPaySessionByToken(token);
    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Session not found' } },
        { status: 404 },
      );
    }

    if (session.status !== 'paid') {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_PAID', message: 'Receipt is only available after payment' } },
        { status: 400 },
      );
    }

    // Rate limit: one email per session
    const checkResult = await db.execute(
      sql`SELECT receipt_emailed_at FROM guest_pay_sessions WHERE id = ${session.id}`,
    );
    const checkRows = Array.from(checkResult as Iterable<Record<string, unknown>>);
    if (checkRows[0]?.receipt_emailed_at) {
      return NextResponse.json(
        { error: { code: 'ALREADY_SENT', message: 'Receipt has already been emailed for this session' } },
        { status: 409 },
      );
    }

    // Build line items from order
    let lines: Array<{
      name: string;
      qty: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }> = [];

    if (session.orderId && session.tenantId) {
      try {
        const order = await getOrder(session.tenantId, session.orderId);
        lines = order.lines.map((line) => ({
          name: line.catalogItemName,
          qty: line.qty,
          unitPriceCents: line.unitPrice,
          lineTotalCents: line.lineTotal,
        }));
      } catch {
        // Continue with totals only
      }
    }

    const tipCents = session.tipCents ?? 0;

    const html = buildReceiptHtml({
      restaurantName: session.restaurantName,
      tableLabel: session.tableLabel,
      paidAt: session.paidAt,
      lines,
      subtotalCents: session.subtotalCents,
      taxCents: session.taxCents,
      serviceChargeCents: session.serviceChargeCents,
      discountCents: session.discountCents,
      totalCents: session.totalCents,
      tipCents,
      grandTotalCents: session.totalCents + tipCents,
    });

    const subject = session.restaurantName
      ? `Your receipt from ${session.restaurantName}`
      : 'Your payment receipt';

    await sendEmail(email, subject, html);

    // Mark as emailed
    await db.execute(
      sql`UPDATE guest_pay_sessions SET receipt_emailed_at = NOW() WHERE id = ${session.id}`,
    );

    return NextResponse.json({ data: { sent: true } });
  },
  { public: true },
);
