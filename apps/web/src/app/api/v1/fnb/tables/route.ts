import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listTables,
  createTable,
  createTableSchema,
} from '@oppsera/module-fnb';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/fnb/tables — list tables with optional filters
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listTables({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      roomId: url.searchParams.get('roomId') ?? undefined,
      sectionId: url.searchParams.get('sectionId') ?? undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : true,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit'), 200, 100),
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

// POST /api/v1/fnb/tables — create a new table
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTableSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const table = await createTable(ctx, parsed.data);
    return NextResponse.json({ data: table }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' , writeAccess: true },
);
