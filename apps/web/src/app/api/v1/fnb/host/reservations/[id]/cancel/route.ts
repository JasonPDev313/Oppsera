import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { cancelReservation } from '@oppsera/module-fnb';

export const POST = withMiddleware(
  async (
    req: NextRequest,
    ctx: any,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // No body is fine — reason is optional
    }

    await cancelReservation(ctx, { id, reason });

    return NextResponse.json({ data: { success: true } });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
