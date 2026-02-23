import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createDeltaChit, createDeltaChitSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/kitchen/tickets/[id]/delta — create a delta chit
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createDeltaChitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const chit = await createDeltaChit(ctx, parsed.data);
    return NextResponse.json({ data: chit }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage' , writeAccess: true },
);
