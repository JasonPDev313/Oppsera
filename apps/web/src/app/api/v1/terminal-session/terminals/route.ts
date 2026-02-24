import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTerminalsForSelection } from '@oppsera/core/profit-centers';
import { getAccessibleTerminalsForRole } from '@oppsera/core/permissions';

// GET /api/v1/terminal-session/terminals?profitCenterId=xxx&roleId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const profitCenterId = request.nextUrl.searchParams.get('profitCenterId');
    if (!profitCenterId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'profitCenterId is required' } },
        { status: 400 },
      );
    }

    const roleId = request.nextUrl.searchParams.get('roleId');
    if (roleId) {
      const terminals = await getAccessibleTerminalsForRole(ctx.tenantId, roleId, profitCenterId);
      return NextResponse.json({ data: terminals });
    }

    const terminals = await getTerminalsForSelection(ctx.tenantId, profitCenterId);
    return NextResponse.json({ data: terminals });
  },
  { entitlement: 'platform_core' },
);
