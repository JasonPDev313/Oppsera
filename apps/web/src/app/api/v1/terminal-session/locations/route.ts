import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getLocationsForSelection } from '@oppsera/core/profit-centers';

// GET /api/v1/terminal-session/locations
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const locations = await getLocationsForSelection(ctx.tenantId);
    return NextResponse.json({ data: locations });
  },
  { entitlement: 'platform_core' },
);
