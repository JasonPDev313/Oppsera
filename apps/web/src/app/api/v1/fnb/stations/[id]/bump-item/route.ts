import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { bumpItem, bumpItemSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/stations/[id]/bump-item — bump a ticket item (mark as ready)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bumpItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await bumpItem(ctx, parsed.data);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage' , writeAccess: true },
);
