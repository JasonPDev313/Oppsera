import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGuestPaySessionByLookupCode } from '@oppsera/module-fnb';

// GET /api/v1/guest-pay/lookup?code=XXXXXX — public lookup by check code
export const GET = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code || code.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Code is required' } },
        { status: 400 },
      );
    }

    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Code must be 6 characters' } },
        { status: 400 },
      );
    }

    const result = await getGuestPaySessionByLookupCode(trimmed);

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No active check found for this code. Please check the code and try again.' } },
        { status: 404 },
      );
    }

    if (result.expired) {
      return NextResponse.json(
        { error: { code: 'SESSION_EXPIRED', message: 'This check has expired. Please ask your server for a new one.' } },
        { status: 410 },
      );
    }

    return NextResponse.json({
      data: {
        token: result.token,
        restaurantName: result.restaurantName,
        tableNumber: result.tableNumber,
      },
    });
  },
  { public: true },
);
