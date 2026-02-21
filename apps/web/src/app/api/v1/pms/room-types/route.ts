import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listRoomTypes,
  createRoomType,
  createRoomTypeSchema,
} from '@oppsera/module-pms';

// GET /api/v1/pms/room-types — list room types (requires ?propertyId=)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'propertyId query parameter is required' },
      ]);
    }

    const limitParam = url.searchParams.get('limit');

    const result = await listRoomTypes({
      tenantId: ctx.tenantId,
      propertyId,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: 'pms.rooms.view' },
);

// POST /api/v1/pms/room-types — create room type
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createRoomTypeSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createRoomType(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.rooms.manage' },
);
