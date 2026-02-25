import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGuestPaySessionByToken } from '@oppsera/module-fnb';
import { getOrder } from '@oppsera/module-orders';

// GET /api/v1/guest-pay/:token/receipt — full itemized receipt (paid sessions only)
export const GET = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 2]!; // before /receipt

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

    // Build line items from order if available
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
        // Order may have been voided or deleted — continue with totals only
      }
    }

    const tipCents = session.tipCents ?? 0;

    return NextResponse.json({
      data: {
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
      },
    });
  },
  { public: true },
);
