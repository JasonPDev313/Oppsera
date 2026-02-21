import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getFloorPlanWithLiveStatus } from '@oppsera/module-fnb';

// GET /api/v1/fnb/tables/floor-plan?roomId=xxx — floor plan with live table statuses
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) {
      throw new AppError('BAD_REQUEST', 'roomId query parameter is required', 400);
    }

    const result = await getFloorPlanWithLiveStatus({
      tenantId: ctx.tenantId,
      roomId,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);
