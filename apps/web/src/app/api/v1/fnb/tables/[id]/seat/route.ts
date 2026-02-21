import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { seatTable, seatTableSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tables/:id/seat — seat guests at table
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tableId = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = seatTableSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await seatTable(ctx, tableId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' },
);
