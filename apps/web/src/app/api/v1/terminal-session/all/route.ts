import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTerminalSelectionAll } from '@oppsera/core/profit-centers';

// GET /api/v1/terminal-session/all?roleId=xxx
// Returns locations + profit centers + terminals in one call
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roleId = request.nextUrl.searchParams.get('roleId') ?? undefined;
    const data = await getTerminalSelectionAll(ctx.tenantId, roleId);
    return NextResponse.json({ data });
  },
  { entitlement: 'platform_core' },
);
