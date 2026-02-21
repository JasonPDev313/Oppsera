import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listServerAssignments,
  assignServerToSection,
  assignServerToSectionSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/sections/assignments — list server assignments
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const businessDate = url.searchParams.get('businessDate');
    if (!businessDate) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'businessDate is required' } },
        { status: 400 },
      );
    }

    const items = await listServerAssignments({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      businessDate,
      status: (url.searchParams.get('status') as 'active' | 'cut' | 'picked_up' | 'closed') ?? undefined,
      serverUserId: url.searchParams.get('serverUserId') ?? undefined,
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

// POST /api/v1/fnb/sections/assignments — assign server to section
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = assignServerToSectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const assignment = await assignServerToSection(ctx, parsed.data);
    return NextResponse.json({ data: assignment }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' },
);
