import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProfitCentersForSelection } from '@oppsera/core/profit-centers';
import { getAccessibleProfitCentersForRole } from '@oppsera/core/permissions';

// GET /api/v1/terminal-session/profit-centers?locationId=xxx&roleId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId');
    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const roleId = request.nextUrl.searchParams.get('roleId');
    if (roleId) {
      const profitCenters = await getAccessibleProfitCentersForRole(ctx.tenantId, roleId, locationId);
      return NextResponse.json({ data: profitCenters });
    }

    const profitCenters = await getProfitCentersForSelection(ctx.tenantId, locationId);
    return NextResponse.json({ data: profitCenters });
  },
  { entitlement: 'platform_core' },
);
