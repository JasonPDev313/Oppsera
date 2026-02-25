import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { cancelReservation } from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/fnb/host/reservations/:id/cancel
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // No body is fine — reason is optional
    }

    await cancelReservation(ctx, id, reason);

    return NextResponse.json({ data: { success: true } });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
