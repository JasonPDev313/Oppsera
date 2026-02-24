import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getLocationsForSelection } from '@oppsera/core/profit-centers';
import { getAccessibleLocationsForRole } from '@oppsera/core/permissions';

// GET /api/v1/terminal-session/locations?roleId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roleId = request.nextUrl.searchParams.get('roleId');

    if (roleId) {
      const locations = await getAccessibleLocationsForRole(ctx.tenantId, roleId);
      return NextResponse.json({ data: locations });
    }

    const locations = await getLocationsForSelection(ctx.tenantId);
    return NextResponse.json({ data: locations });
  },
  { entitlement: 'platform_core' },
);
