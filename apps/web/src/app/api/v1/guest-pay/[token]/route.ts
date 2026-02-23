import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGuestPaySessionByToken } from '@oppsera/module-fnb';

// GET /api/v1/guest-pay/:token — fetch session for guest page
export const GET = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const token = url.pathname.split('/').pop()!;

    const session = await getGuestPaySessionByToken(token);
    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Session not found or expired' } },
        { status: 404 },
      );
    }

    // Strip internal IDs for safety — only expose what guest needs
    return NextResponse.json({
      data: {
        restaurantName: session.restaurantName,
        tableLabel: session.tableLabel,
        status: session.status,
        subtotalCents: session.subtotalCents,
        taxCents: session.taxCents,
        serviceChargeCents: session.serviceChargeCents,
        discountCents: session.discountCents,
        totalCents: session.totalCents,
        tipCents: session.tipCents,
        tipSettings: session.tipSettings,
        expiresAt: session.expiresAt,
        paidAt: session.paidAt,
      },
    });
  },
  { public: true },
);
