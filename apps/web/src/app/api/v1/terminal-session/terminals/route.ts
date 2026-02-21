import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTerminalsForSelection } from '@oppsera/core/profit-centers';

// GET /api/v1/terminal-session/terminals?profitCenterId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const profitCenterId = request.nextUrl.searchParams.get('profitCenterId');
    if (!profitCenterId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'profitCenterId is required' } },
        { status: 400 },
      );
    }

    const terminals = await getTerminalsForSelection(ctx.tenantId, profitCenterId);
    return NextResponse.json({ data: terminals });
  },
  { entitlement: 'platform_core' },
);
