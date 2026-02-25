import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateReservation,
  updateReservationSchema,
} from '@oppsera/module-fnb';

export const PATCH = withMiddleware(
  async (
    req: NextRequest,
    ctx: any,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateReservationSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid reservation update',
        parsed.error.issues,
      );
    }

    const result = await updateReservation(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
