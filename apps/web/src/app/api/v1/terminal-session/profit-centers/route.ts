import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProfitCentersForSelection } from '@oppsera/core/profit-centers';

// GET /api/v1/terminal-session/profit-centers?locationId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId');
    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const profitCenters = await getProfitCentersForSelection(ctx.tenantId, locationId);
    return NextResponse.json({ data: profitCenters });
  },
  { entitlement: 'platform_core' },
);
