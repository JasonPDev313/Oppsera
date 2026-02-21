import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listSections, createSection, createSectionSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/sections — list sections
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const items = await listSections({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      roomId: url.searchParams.get('roomId') ?? undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : true,
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

// POST /api/v1/fnb/sections — create section
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createSectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const section = await createSection(ctx, parsed.data);
    return NextResponse.json({ data: section }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' },
);
