import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { noShowReservation } from '@oppsera/module-fnb';

export const POST = withMiddleware(
  async (
    _req: NextRequest,
    ctx: any,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;

    await noShowReservation(ctx, { id });

    return NextResponse.json({ data: { success: true } });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
