import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  checkInReservation,
  checkInReservationSchema,
} from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/fnb/host/reservations/:id/check-in
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const body = await req.json();
    const parsed = checkInReservationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid check-in input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await checkInReservation(ctx, id, parsed.data);

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
