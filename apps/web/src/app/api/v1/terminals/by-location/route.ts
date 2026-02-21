import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listTerminalsByLocation } from '@oppsera/core/profit-centers';

// GET /api/v1/terminals/by-location?locationId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId');

    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const result = await listTerminalsByLocation({
      tenantId: ctx.tenantId,
      locationId,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);
