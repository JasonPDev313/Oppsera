import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { atomicSeatParty, atomicSeatPartySchema } from '@oppsera/module-fnb';

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const parsed = atomicSeatPartySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid seat party input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await atomicSeatParty(ctx, parsed.data);
    broadcastFnb(ctx, 'tables', 'tabs', 'waitlist', 'reservations').catch(() => {});
    return NextResponse.json({ data: result }, { status: 201 });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
