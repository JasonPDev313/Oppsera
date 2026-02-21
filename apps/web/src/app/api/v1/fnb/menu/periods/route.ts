import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createMenuPeriod, createMenuPeriodSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/menu/periods — create menu period
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createMenuPeriodSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const period = await createMenuPeriod(ctx, parsed.data);
    return NextResponse.json({ data: period }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.manage' },
);
