import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGuestPaySessionByToken } from '@oppsera/module-fnb';

// GET /api/v1/guest-pay/:token/status — lightweight status check
export const GET = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 2]!; // before /status

    const session = await getGuestPaySessionByToken(token);
    if (!session) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Session not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        status: session.status,
        paidAt: session.paidAt,
      },
    });
  },
  { public: true },
);
