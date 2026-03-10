import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGroupRoomMatrix, PMS_PERMISSIONS } from '@oppsera/module-pms';

// GET /api/v1/pms/groups/[id]/matrix
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 2]!;

    const data = await getGroupRoomMatrix(ctx.tenantId, id);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GROUPS_VIEW },
);
