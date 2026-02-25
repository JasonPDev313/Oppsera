import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { noShowReservation } from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/fnb/host/reservations/:id/no-show
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (_req: NextRequest, ctx) => {
    const id = extractId(_req);

    await noShowReservation(ctx, id);

    return NextResponse.json({ data: { success: true } });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
