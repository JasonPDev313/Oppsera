import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateMenuPeriod, updateMenuPeriodSchema } from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/menu/periods/:id — update menu period
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const periodId = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateMenuPeriodSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const period = await updateMenuPeriod(ctx, periodId, parsed.data);
    return NextResponse.json({ data: period });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.manage' , writeAccess: true },
);
