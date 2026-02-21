import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  acquireSoftLock,
  listActiveLocks,
  acquireSoftLockSchema,
  listActiveLocksSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/locks — list active locks
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listActiveLocksSchema.safeParse({
      tenantId: ctx.tenantId,
      entityType: url.searchParams.get('entityType') || undefined,
      locationId: url.searchParams.get('locationId') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listActiveLocks(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

// POST /api/v1/fnb/locks — acquire a soft lock
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = acquireSoftLockSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await acquireSoftLock(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' },
);
