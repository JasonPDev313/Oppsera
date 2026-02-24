import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getRoomSectionAssignments } from '@oppsera/module-fnb';

// GET /api/v1/fnb/my-section/room?roomId=xxx&businessDate=yyyy-mm-dd
// Returns ALL server→table assignments for the room (manager visibility)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    const businessDate = url.searchParams.get('businessDate');

    if (!roomId || !businessDate) {
      throw new ValidationError('roomId and businessDate are required', []);
    }

    const assignments = await getRoomSectionAssignments({
      tenantId: ctx.tenantId,
      roomId,
      businessDate,
    });

    return NextResponse.json({ data: assignments });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);
